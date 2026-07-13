import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const UAZAPI_URL = 'https://btechsoutoshop.uazapi.com';
const UAZAPI_TOKEN = '5efd90a1-116b-4c86-b715-7bac2fab658a';
const GISELE_WHATSAPP_NUMBER = Deno.env.get('GISELE_WHATSAPP_NUMBER') || '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const { patient_name, quantidade_sessoes } = await req.json();

    if (!GISELE_WHATSAPP_NUMBER) {
      return new Response(JSON.stringify({ error: 'GISELE_WHATSAPP_NUMBER nao configurado' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const texto = `✅ *Passaporte de Tratamento concluído*\n\n*${patient_name}* concluiu as ${quantidade_sessoes} sessões contratadas do pacote.\n\nVerifique com a cliente se ela deseja renovar ou encerrar o acompanhamento.`;

    const res = await fetch(`${UAZAPI_URL}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
      body: JSON.stringify({ number: GISELE_WHATSAPP_NUMBER, text: texto }),
    });

    const sendData = await res.json().catch(() => ({}));
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'falha ao enviar whatsapp', detail: sendData }), {
        status: 502, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    return new Response(JSON.stringify({ ok: true, sent: sendData }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
});
