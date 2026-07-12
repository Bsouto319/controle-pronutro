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
    const { patient_name, patient_email, patient_phone, semana, dose_mg, proxima_dose_mg, data_aplicacao } = await req.json();
    if (!semana || (!patient_email && !patient_phone)) {
      return new Response(JSON.stringify({ error: 'semana e (patient_email ou patient_phone) sao obrigatorios' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
    const nome = patient_name || 'Paciente';
    const dataFmt = data_aplicacao
      ? new Date(data_aplicacao + 'T12:00:00').toLocaleDateString('pt-BR')
      : 'nao informada';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Confirmacao de Dose</title></head>
<body style="margin:0;padding:0;background:#f5f0eb;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f0eb;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.10);">
      <tr>
        <td style="background:#ffffff;padding:28px 32px 20px;border-bottom:3px solid #C4916A;text-align:center;">
          <img src="${LOGO_URL}" width="220" height="75" alt="ProNutro" style="display:block;margin:0 auto;" />
        </td>
      </tr>
      <tr><td style="background:#1a6b3c;padding:10px 32px;">
        <p style="color:#fff;font-size:13px;font-weight:bold;margin:0;font-family:Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;">Confirmacao de Aplicacao &mdash; ${semana}a Dose</p>
      </td></tr>
      <tr><td style="padding:28px 32px 8px;text-align:center;">
        <div style="display:inline-block;background:#dcfce7;border-radius:50%;width:60px;height:60px;line-height:60px;text-align:center;font-size:28px;">&#10003;</div>
        <p style="color:#14532d;font-size:19px;font-weight:bold;margin:12px 0 4px;font-family:Georgia,serif;">Dose Confirmada!</p>
        <p style="color:#666;font-size:14px;margin:0;font-family:Arial,sans-serif;">Ola, <strong style="color:#1a1a1a;">${nome}</strong> &mdash; sua ${semana}a aplicacao foi registrada com sucesso.</p>
      </td></tr>
      <tr><td style="padding:20px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #C4916A;border-radius:12px;overflow:hidden;">
          <tr><td style="background:#C4916A;padding:12px 20px;">
            <p style="color:#fff;font-size:12px;font-weight:bold;margin:0;font-family:Arial,sans-serif;letter-spacing:1px;">RESUMO DA APLICACAO</p>
          </td></tr>
          <tr><td style="padding:0 20px 4px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="color:#666;font-size:14px;padding:10px 0 8px;font-family:Arial,sans-serif;border-bottom:1px solid #f0e8e0;">Numero da dose</td>
                  <td style="color:#1a1a1a;font-size:14px;font-weight:bold;padding:10px 0 8px;text-align:right;font-family:Arial,sans-serif;border-bottom:1px solid #f0e8e0;">${semana}a dose</td></tr>
              ${dose_mg ? `<tr><td style="color:#666;font-size:14px;padding:8px 0;font-family:Arial,sans-serif;border-bottom:1px solid #f0e8e0;">Dose aplicada</td><td style="color:#1a1a1a;font-size:14px;font-weight:bold;padding:8px 0;text-align:right;font-family:Arial,sans-serif;border-bottom:1px solid #f0e8e0;">${dose_mg} mg</td></tr>` : ''}
              <tr><td style="color:#666;font-size:14px;padding:8px 0;font-family:Arial,sans-serif;${proxima_dose_mg ? 'border-bottom:1px solid #f0e8e0;' : ''}">Data da aplicacao</td>
                  <td style="color:#1a1a1a;font-size:14px;font-weight:bold;padding:8px 0;text-align:right;font-family:Arial,sans-serif;">${dataFmt}</td></tr>
              ${proxima_dose_mg ? `<tr><td style="color:#666;font-size:14px;padding:8px 0 10px;font-family:Arial,sans-serif;">Proxima dose prevista</td><td style="color:#1a6b3c;font-size:14px;font-weight:bold;padding:8px 0 10px;text-align:right;font-family:Arial,sans-serif;">${proxima_dose_mg} mg</td></tr>` : ''}
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff8f0;border-left:4px solid #C4916A;border-radius:0 8px 8px 0;">
          <tr><td style="padding:14px 18px;"><p style="color:#7a4a1e;font-size:13px;margin:0;font-family:Arial,sans-serif;">Atencao: Em caso de nausea intensa, dor abdominal ou vomitos, entre em contato com a clinica imediatamente.</p></td></tr>
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

    const text = `Ola, ${nome}!\n\nSua ${semana}a dose foi confirmada.\n\n- Dose: ${dose_mg ?? ''}mg\n- Data: ${dataFmt}\n${proxima_dose_mg ? `- Proxima dose: ${proxima_dose_mg}mg\n` : ''}\nProNutro - SGAS 616 lotes 116/117, Asa Sul, Brasilia/DF`;

    const whatsappNumber = patient_phone ? formatPhone(patient_phone) : null;
    const waMssg = [
      `*ProNutro*`,
      `Nutrologia e Terapias Integrativas`,
      ``,
      `Dose confirmada, *${nome}*!`,
      ``,
      `Resumo da ${semana}a aplicacao:`,
      dose_mg ? `- Dose aplicada: *${dose_mg} mg*` : '',
      `- Data: *${dataFmt}*`,
      proxima_dose_mg ? `- Proxima dose: *${proxima_dose_mg} mg*` : '',
      ``,
      `Atencao: Nausea intensa, dor ou vomitos? Contate a clinica imediatamente.`,
      ``,
      `Cuide-se bem!`,
    ].filter(Boolean).join('\n');

    const [emailRes, waRes] = await Promise.allSettled([
      patient_email
        ? fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
            body: JSON.stringify({
              from: 'ProNutro <noreply@btechsouto.shop>',
              to: [patient_email],
              subject: `${nome} - Confirmacao: ${semana}a dose de Tirzepatida aplicada`,
              html, text,
            }),
          })
        : Promise.resolve(null),
      whatsappNumber
        ? fetch(`${UAZAPI_URL}/send/text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
            body: JSON.stringify({ number: whatsappNumber, text: waMssg }),
          })
        : Promise.resolve(null),
    ]);

    const emailData = emailRes.status === 'fulfilled' && emailRes.value ? await emailRes.value.json().catch(() => ({})) : { skipped: !patient_email };
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
