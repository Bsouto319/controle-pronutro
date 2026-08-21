import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UAZAPI_URL = 'https://btechsoutoshop.uazapi.com';
const UAZAPI_TOKEN = '5efd90a1-116b-4c86-b715-7bac2fab658a';

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) return '55' + digits;
  if (digits.length === 13 && digits.startsWith('55')) return digits;
  return digits;
}

// Toda aplicacao acontece as quintas ou sextas: a janela de retorno da semana
// so fecha depois da sexta correspondente aquela quinta (ou no proprio dia, se ja for sexta).
function fimDaJanela(dataStr: string): Date {
  const d = new Date(dataStr + 'T12:00:00');
  if (d.getDay() === 4) d.setDate(d.getDate() + 1); // quinta -> estende ate sexta
  return d;
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);

  // janela de 30 dias pra tras evita reprocessar historico antigo desnecessariamente
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() - 30);
  const limiteStr = limite.toISOString().split('T')[0];

  const { data: candidatos, error } = await supabase
    .from('pronutro_dose_records')
    .select('id, patient_id, ciclo, semana, proxima_data_aplicacao, proxima_dose_mg, pronutro_patients!inner(nome, telefone, ativo, ciclo_atual)')
    .not('proxima_data_aplicacao', 'is', null)
    .gte('proxima_data_aplicacao', limiteStr)
    .is('retorno_verificado_em', null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const { data: todasDoses, error: errDoses } = await supabase
    .from('pronutro_dose_records')
    .select('patient_id, ciclo, semana, data_aplicacao');

  if (errDoses) {
    return new Response(JSON.stringify({ error: errDoses.message }), { status: 500 });
  }

  const results: { patient: string; phone: string; ok: boolean; status: number }[] = [];
  const naoProcessar: string[] = [];
  const marcarSemFalta: string[] = [];
  const marcarComFalta: string[] = [];

  for (const c of candidatos ?? []) {
    const p = c.pronutro_patients as { nome: string; telefone: string; ativo: boolean; ciclo_atual: number } | null;
    if (!p?.telefone || p.ativo === false) { naoProcessar.push(c.id); continue; }

    // So vale a pena checar a semana "vigente" -- se o paciente ja avancou pra
    // um ciclo novo (Finalizar Protocolo / Iniciar Novo Protocolo), a semana em
    // aberto de um ciclo antigo nao e mais no-show, so ficou obsoleta.
    if (c.ciclo !== (p.ciclo_atual ?? 1)) {
      marcarSemFalta.push(c.id);
      continue;
    }

    const janelaFim = fimDaJanela(c.proxima_data_aplicacao);
    if (hoje <= janelaFim) continue; // janela ainda nao fechou, verifica de novo amanha

    const proxima = (todasDoses ?? []).find(
      (d) => d.patient_id === c.patient_id && d.ciclo === c.ciclo && d.semana === c.semana + 1
    );

    if (proxima?.data_aplicacao) {
      // paciente ja voltou (mesmo que fora da janela original) — nao e mais no-show
      marcarSemFalta.push(c.id);
      continue;
    }

    // Reconfirma na hora, direto no banco -- a lista de "todasDoses" foi buscada
    // uma vez so no inicio, e o processamento de varios pacientes com espacamento
    // pode levar minutos. Evita mandar a mensagem pra quem acabou de ser atendido
    // enquanto a funcao ainda estava rodando.
    const { data: aindaSemRetorno } = await supabase
      .from('pronutro_dose_records')
      .select('id')
      .eq('patient_id', c.patient_id)
      .eq('ciclo', c.ciclo)
      .eq('semana', c.semana + 1)
      .not('data_aplicacao', 'is', null)
      .maybeSingle();

    if (aindaSemRetorno) {
      marcarSemFalta.push(c.id);
      continue;
    }

    marcarComFalta.push(c.id);

    const phone = formatPhone(p.telefone);
    const dataFormatada = new Date(c.proxima_data_aplicacao + 'T12:00:00').toLocaleDateString('pt-BR');
    const msg = [
      `Ola, *${p.nome}*!`,
      ``,
      `Notamos que voce nao compareceu a sua aplicacao prevista para *${dataFormatada}*.`,
      ``,
      `Podemos te ajudar a marcar uma nova data? Responda esta mensagem ou entre em contato com a clinica.`,
      ``,
      `_ProNutro - Nutrologia e Terapias Integrativas_`,
    ].join('\n');

    const res = await fetch(`${UAZAPI_URL}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
      body: JSON.stringify({ number: phone, text: msg }),
    });

    results.push({ patient: p.nome, phone, ok: res.ok, status: res.status });

    // espacamento sequencial — mesma cautela anti-bloqueio usada no lembrete de retorno
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  const agora = new Date().toISOString();
  if (marcarComFalta.length > 0) {
    await supabase.from('pronutro_dose_records')
      .update({ no_show: true, retorno_verificado_em: agora })
      .in('id', marcarComFalta);
  }
  if (marcarSemFalta.length > 0) {
    await supabase.from('pronutro_dose_records')
      .update({ no_show: false, retorno_verificado_em: agora })
      .in('id', marcarSemFalta);
  }

  return new Response(
    JSON.stringify({ verificados: (candidatos ?? []).length, no_show: marcarComFalta.length, voltaram: marcarSemFalta.length, mensagens: results }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
