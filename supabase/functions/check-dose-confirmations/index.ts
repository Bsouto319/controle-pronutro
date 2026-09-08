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
  if (t.includes('não') || t.includes('nao') || t.includes('remarcar')) return false;
  return t.includes('sim') || t.includes('confirm') || t.includes('vou comparecer') || t.includes('compareç') || t.includes('compare');
}

function isNegativo(texto: string): boolean {
  const t = texto.toLowerCase();
  return t.includes('não') || t.includes('nao') || t.includes('remarcar') || t.includes('reagend');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const db = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data: pendentes, error } = await db
      .from('pronutro_dose_records')
      .select('id, patient_id, retorno_confirmacao_enviado_em, pronutro_patients!inner(nome, telefone, ativo)')
      .eq('retorno_confirmacao_status', 'aguardando');

    if (error) throw error;
    if (!pendentes || pendentes.length === 0) {
      return new Response(JSON.stringify({ ok: true, pendentes: 0 }), { headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    const res = await fetch(`${UAZAPI_URL}/message/find`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
      body: JSON.stringify({ limit: 500, orderBy: 'messageTimestamp', order: 'DESC' }),
    });
    if (!res.ok) throw new Error(`UAZAPI ${res.status}`);
    const payload = await res.json();
    const all: any[] = payload.messages ?? [];

    const results: Array<{ patient: string; status: string }> = [];

    for (const r of pendentes) {
      const p = r.pronutro_patients as { nome: string; telefone: string; ativo: boolean } | null;
      if (!p?.telefone || p.ativo === false) continue;
      const numeros = phoneVariants(p.telefone);
      if (numeros.length === 0) continue;
      const enviadoMs = r.retorno_confirmacao_enviado_em ? new Date(r.retorno_confirmacao_enviado_em).getTime() : 0;

      const resposta = all.find((m: any) => {
        const ts = toMs(m.messageTimestamp);
        const texto: string = m.text || m.content?.text || m.body || m.buttonOrListid
          || m.content?.selectedDisplayText || m.content?.Response?.SelectedDisplayText || '';
        return ts > enviadoMs
          && !m.isGroup
          && !m.fromMe // resposta do paciente, nunca eco/mensagem da propria clinica
          && typeof m.chatid === 'string'
          && numeros.some(n => m.chatid.startsWith(n) && !m.chatid.startsWith(n + ':')) // ignora eco de mensagem enviada pela propria clinica
          && !!texto;
      });

      if (!resposta) continue;
      const texto: string = resposta.text || resposta.content?.text || resposta.body || resposta.buttonOrListid
        || resposta.content?.selectedDisplayText || resposta.content?.Response?.SelectedDisplayText || '';

      let novoStatus: string | null = null;
      if (isAfirmativo(texto)) novoStatus = 'confirmado';
      else if (isNegativo(texto)) novoStatus = 'recusado';

      if (novoStatus) {
        await db.from('pronutro_dose_records').update({
          retorno_confirmacao_status: novoStatus,
          retorno_confirmacao_respondido_em: new Date().toISOString(),
        }).eq('id', r.id);
        results.push({ patient: p.nome, status: novoStatus });
      }
    }

    return new Response(JSON.stringify({ ok: true, pendentes: pendentes.length, atualizados: results }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
});
