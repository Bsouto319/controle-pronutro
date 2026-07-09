import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const UAZAPI_URL = 'https://btechsoutoshop.uazapi.com';
const UAZAPI_TOKEN = '5efd90a1-116b-4c86-b715-7bac2fab658a';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DoseRow {
  semana: number;
  dose_mg: number | null;
  data_aplicacao: string | null;
}

function formatPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) return '55' + digits;
  if (digits.length === 13 && digits.startsWith('55')) return digits;
  if (digits.length === 12 && digits.startsWith('55')) return digits;
  return null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const { patient_name, patient_phone, doses } = await req.json() as {
      patient_name: string;
      patient_phone: string;
      doses: DoseRow[];
    };

    if (!patient_phone || !Array.isArray(doses)) {
      return new Response(JSON.stringify({ error: 'patient_phone e doses sao obrigatorios' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const phone = formatPhone(patient_phone);
    if (!phone) {
      return new Response(JSON.stringify({ error: 'Telefone invalido.' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const nome = patient_name || 'Paciente';
    const aplicadas = doses.filter(d => d.dose_mg != null).sort((a, b) => a.semana - b.semana);

    // Mensagem 100% ASCII (UAZAPI corrompe acentos/emoji)
    const linhas = aplicadas.map(d =>
      `Semana ${d.semana}: ${d.dose_mg}mg${d.data_aplicacao ? ' - ' + formatDate(d.data_aplicacao) : ''}`
    );

    const msg = [
      `Ola, ${nome}!`,
      '',
      'Protocolo de tratamento finalizado na Clinica ProNutro. Segue o relatorio de doses aplicadas:',
      '',
      ...linhas,
      '',
      `Total de aplicacoes: ${aplicadas.length}`,
      '',
      'Obrigado por confiar na ProNutro!',
      'ProNutro | Nutrologia e Terapias Integrativas',
    ].join('\n');

    const res = await fetch(`${UAZAPI_URL}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': UAZAPI_TOKEN },
      body: JSON.stringify({ number: phone, text: msg }),
    });

    if (!res.ok) {
      const body = await res.text();
      return new Response(JSON.stringify({ error: `UAZAPI: ${body}` }), {
        status: 502, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
});
