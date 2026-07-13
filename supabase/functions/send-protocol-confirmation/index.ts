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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const { patient_id, patient_name, patient_phone, tipo } = await req.json();

    if (!patient_id || !patient_phone || (tipo !== 'termino' && tipo !== 'novo')) {
      return new Response(JSON.stringify({ error: 'patient_id, patient_phone e tipo (termino|novo) sao obrigatorios' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const numero = formatPhone(patient_phone);
    if (!numero) {
      return new Response(JSON.stringify({ error: 'telefone invalido' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const nome = patient_name || 'Paciente';
    const texto = tipo === 'termino'
      ? `Ola, *${nome}*!\n\nA Clinica ProNutro esta finalizando seu protocolo atual de tratamento.\n\nVoce esta de acordo com o termino deste protocolo?`
      : `Ola, *${nome}*!\n\nVamos iniciar um novo protocolo de tratamento com voce na Clinica ProNutro.\n\nVoce esta de acordo em iniciar este novo protocolo?`;

    const res = await fetch(`${UAZAPI_URL}/send/menu`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
      body: JSON.stringify({
        number: numero,
        type: 'button',
        text: texto,
        choices: ['Sim, estou de acordo', 'Não, quero falar com a clínica'],
      }),
    });

    const sendData = await res.json().catch(() => ({}));

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'falha ao enviar botao', detail: sendData }), {
        status: 502, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const db = createClient(SUPABASE_URL, SUPABASE_KEY);
    await db.from('pronutro_patients').update({
      protocolo_confirmacao_status: 'aguardando',
      protocolo_confirmacao_tipo: tipo,
      protocolo_confirmacao_enviado_em: new Date().toISOString(),
      protocolo_confirmacao_respondido_em: null,
    }).eq('id', patient_id);

    return new Response(JSON.stringify({ ok: true, sent: sendData }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
});
