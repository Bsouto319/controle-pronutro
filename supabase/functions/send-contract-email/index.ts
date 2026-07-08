import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_KEY = Deno.env.get('RESEND_API_KEY') || '';
const UAZAPI_URL = 'https://btechsoutoshop.uazapi.com';
const UAZAPI_TOKEN = '5efd90a1-116b-4c86-b715-7bac2fab658a';
const LOGO_URL = 'https://controle-pronutro.vercel.app/logo.svg';

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
    const { patient_name, patient_email, patient_phone, contract_url } = await req.json();
    if (!patient_email || !contract_url) {
      return new Response(JSON.stringify({ error: 'patient_email e contract_url sao obrigatorios' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
    const nome = patient_name || 'Paciente';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Contrato ProNutro</title></head>
<body style="margin:0;padding:0;background:#f5f0eb;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f0eb;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.10);">
      <tr>
        <td style="background:#ffffff;padding:28px 32px 20px;border-bottom:3px solid #C4916A;text-align:center;">
          <img src="${LOGO_URL}" width="220" height="75" alt="ProNutro" style="display:block;margin:0 auto;" />
        </td>
      </tr>
      <tr><td style="background:#C4916A;padding:10px 32px;">
        <p style="color:#fff;font-size:13px;font-weight:bold;margin:0;font-family:Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;">Contrato de Prestacao de Servicos Medicos</p>
      </td></tr>
      <tr><td style="padding:32px 32px 0;">
        <p style="color:#1a1a1a;font-size:17px;font-weight:bold;margin:0 0 6px;font-family:Georgia,serif;">Ola, ${nome}!</p>
        <p style="color:#444;font-size:15px;line-height:1.75;margin:0 0 24px;font-family:Arial,sans-serif;">Seu cadastro na <strong style="color:#1a6b3c;">Clinica ProNutro</strong> foi realizado com sucesso. Para iniciar seu tratamento com <strong>Tirzepatida (Mounjaro&reg;)</strong>, por favor leia e assine o contrato abaixo.</p>
      </td></tr>
      <tr><td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff8f0;border-left:4px solid #C4916A;border-radius:0 8px 8px 0;">
          <tr><td style="padding:14px 18px;">
            <p style="color:#7a4a1e;font-size:14px;margin:0;font-family:Arial,sans-serif;"><strong>Prazo de 7 dias</strong> para assinar. Apos esse prazo o link expirara.</p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 32px;text-align:center;">
        <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
          <tr><td style="background:#1a6b3c;border-radius:10px;box-shadow:0 4px 16px rgba(26,107,60,0.30);">
            <a href="${contract_url}" style="display:inline-block;padding:16px 52px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;font-family:Arial,sans-serif;">Ler e Assinar Contrato</a>
          </td></tr>
        </table>
        <p style="font-size:12px;color:#aaa;margin:16px 0 0;font-family:Arial,sans-serif;">Ou acesse: <a href="${contract_url}" style="color:#C4916A;word-break:break-all;">${contract_url}</a></p>
      </td></tr>
      <tr><td style="padding:0 32px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;">
          <tr><td style="padding:18px 20px;">
            <p style="color:#14532d;font-size:14px;font-weight:bold;margin:0 0 8px;font-family:Arial,sans-serif;">Proximo passo apos a assinatura</p>
            <p style="color:#166534;font-size:13px;line-height:1.6;margin:0;font-family:Arial,sans-serif;">Nossa equipe agendara sua primeira aplicacao e entrara em contato com as orientacoes iniciais.</p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="background:#f9f6f3;padding:20px 32px;text-align:center;border-top:1px solid #e8ddd5;">
        <p style="color:#aaa;font-size:12px;margin:0 0 4px;font-family:Arial,sans-serif;">Clinica ProNutro &mdash; Nutrologia e Terapias Integrativas</p>
        <p style="color:#aaa;font-size:12px;margin:0;font-family:Arial,sans-serif;">SGAS 616 lotes 116/117, Asa Sul, Brasilia/DF</p>
        <p style="color:#ccc;font-size:11px;margin:8px 0 0;font-family:Arial,sans-serif;">Email automatico &mdash; nao responda a esta mensagem.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

    const text = `Ola, ${nome}!\n\nSeu cadastro na Clinica ProNutro foi realizado com sucesso.\nAssine o contrato em (valido por 7 dias):\n${contract_url}\n\nProNutro - SGAS 616 lotes 116/117, Asa Sul, Brasilia/DF`;

    const whatsappNumber = patient_phone ? formatPhone(patient_phone) : null;
    const waMssg = [
      `Olá, ${nome}! 😊`,
      ``,
      `Estamos enviando o link para a assinatura do Contrato de Tratamento referente ao seu acompanhamento na Clínica ProNutro.`,
      ``,
      `Para prosseguir, basta acessar o link abaixo e realizar a assinatura:`,
      ``,
      contract_url,
      ``,
      `⏳ Importante: este link é válido por 7 dias.`,
      ``,
      `Caso tenha qualquer dúvida, é só responder a esta mensagem ou entrar em contato com a nossa equipe. Será um prazer atendê-la!`,
      ``,
      `Equipe ProNutro`,
    ].join('\n');

    const [emailRes, waRes] = await Promise.allSettled([
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({
          from: 'ProNutro <noreply@btechsouto.shop>',
          to: [patient_email],
          subject: `${nome} - Seu contrato ProNutro aguarda assinatura`,
          html, text,
        }),
      }),
      whatsappNumber
        ? fetch(`${UAZAPI_URL}/send/text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
            body: JSON.stringify({ number: whatsappNumber, text: waMssg, linkPreview: true }),
          })
        : Promise.resolve(null),
    ]);

    const emailData = emailRes.status === 'fulfilled' && emailRes.value ? await emailRes.value.json().catch(() => ({})) : { error: 'email_failed' };
    const waData = waRes.status === 'fulfilled' && waRes.value ? await waRes.value.json().catch(() => ({})) : { skipped: !whatsappNumber };

    return new Response(JSON.stringify({ email: emailData, whatsapp: waData }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
});
