import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UAZAPI_URL = 'https://btechsoutoshop.uazapi.com';
const UAZAPI_TOKEN = '5efd90a1-116b-4c86-b715-7bac2fab658a';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) return '55' + digits;
  if (digits.length === 13 && digits.startsWith('55')) return digits;
  if (digits.length === 12 && digits.startsWith('55')) return digits;
  return null;
}

// WhatsApp às vezes registra o número sem o 9º dígito extra do celular (formato antigo).
// Gera as duas variantes (com e sem o 9) pra não perder o match por causa disso.
function phoneVariants(raw: string): string[] {
  const base = formatPhone(raw);
  if (!base) return [];
  const ddd = base.slice(2, 4);
  const local = base.slice(4);
  if (local.length === 9 && local[0] === '9') return [base, '55' + ddd + local.slice(1)];
  if (local.length === 8) return [base, '55' + ddd + '9' + local];
  return [base];
}

function toMs(ts: number): number {
  return ts > 2_000_000_000 ? ts : ts * 1000;
}

function isAfirmativo(texto: string): boolean {
  const t = texto.toLowerCase();
  if (t.includes('não') || t.includes('nao')) return false;
  return t.includes('sim') || t.includes('concord') || t.includes('de acordo');
}

function isNegativo(texto: string): boolean {
  const t = texto.toLowerCase();
  return t.includes('não') || t.includes('nao');
}

function extrairTexto(m: any): string {
  return m.text || m.content?.text || m.body || m.buttonOrListid
    || m.content?.selectedDisplayText || m.content?.Response?.SelectedDisplayText || '';
}

// Busca as mensagens de UM chat específico (não a lista global) -- uma busca
// global de "últimas 500 mensagens da conta inteira" fica pequena demais
// conforme o volume de mensagens da clínica cresce: uma conversa de semanas
// atrás simplesmente sai da janela porque mensagens de OUTROS pacientes mais
// recentes empurram ela pra fora. Buscando por chatid, cada paciente tem sua
// própria janela, não compete por espaço com o resto da conta.
async function buscarRespostaPaciente(numeros: string[], enviadoMs: number): Promise<{ status: 'confirmado' | 'recusado' } | null> {
  for (const numero of numeros) {
    const res = await fetch(`${UAZAPI_URL}/message/find`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
      body: JSON.stringify({ chatid: `${numero}@s.whatsapp.net`, limit: 50, orderBy: 'messageTimestamp', order: 'DESC' }),
    });
    if (!res.ok) continue;
    const payload = await res.json();
    const msgs: any[] = payload.messages ?? [];
    if (msgs.length === 0) continue;

    const candidatos = msgs
      .filter((m) => toMs(m.messageTimestamp) > enviadoMs && !m.isGroup && !m.fromMe)
      .sort((a, b) => toMs(a.messageTimestamp) - toMs(b.messageTimestamp)); // mais antiga primeiro

    for (const m of candidatos) {
      const texto = extrairTexto(m);
      if (!texto) continue;
      if (isAfirmativo(texto)) return { status: 'confirmado' };
      if (isNegativo(texto)) return { status: 'recusado' };
    }
  }
  return null;
}

// Roda no máximo N buscas em paralelo por vez, pra não estourar limite da UAZAPI
// nem deixar a function rodando por minutos com muitos pacientes pendentes.
async function withConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const db = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data: pendentes, error } = await db
      .from('pronutro_patients')
      .select('id, nome, telefone, protocolo_confirmacao_enviado_em')
      .eq('protocolo_confirmacao_status', 'aguardando');

    if (error) throw error;
    if (!pendentes || pendentes.length === 0) {
      return new Response(JSON.stringify({ ok: true, pendentes: 0 }), { headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    const results: Array<{ patient: string; status: string }> = [];

    await withConcurrency(pendentes, 8, async (p) => {
      const numeros = p.telefone ? phoneVariants(p.telefone) : [];
      if (numeros.length === 0) return;
      const enviadoMs = p.protocolo_confirmacao_enviado_em ? new Date(p.protocolo_confirmacao_enviado_em).getTime() : 0;

      const resposta = await buscarRespostaPaciente(numeros, enviadoMs);
      if (!resposta) return;

      await db.from('pronutro_patients').update({
        protocolo_confirmacao_status: resposta.status,
        protocolo_confirmacao_respondido_em: new Date().toISOString(),
      }).eq('id', p.id);
      results.push({ patient: p.nome, status: resposta.status });
    });

    return new Response(JSON.stringify({ ok: true, pendentes: pendentes.length, atualizados: results }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
});
