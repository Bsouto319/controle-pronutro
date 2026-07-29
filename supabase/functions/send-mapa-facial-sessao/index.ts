// Envia pro paciente (WhatsApp) uma imagem do rosto com as marcações da
// sessão que a Dra. Gisele acabou de salvar, + lembrete do próximo retorno.
const UAZAPI_URL = 'https://btechsoutoshop.uazapi.com'
const UAZAPI_TOKEN = '5efd90a1-116b-4c86-b715-7bac2fab658a'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

function formatPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11) return '55' + digits
  if (digits.length === 13 && digits.startsWith('55')) return digits
  if (digits.length === 12 && digits.startsWith('55')) return digits
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const { patient_name, patient_phone, image_base64, data_sessao, proximo_retorno } = await req.json()

    if (!patient_phone || !image_base64) {
      return new Response(JSON.stringify({ error: 'patient_phone e image_base64 sao obrigatorios' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    const phone = formatPhone(patient_phone)
    if (!phone) {
      return new Response(JSON.stringify({ error: 'telefone invalido' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    const nome = patient_name || 'Paciente'
    const dataFmt = data_sessao ? new Date(data_sessao + 'T12:00:00').toLocaleDateString('pt-BR') : null
    const retornoFmt = proximo_retorno ? new Date(proximo_retorno + 'T12:00:00').toLocaleDateString('pt-BR') : null

    const caption = [
      `Olá, *${nome}*!`,
      ``,
      `Aqui está o registro do que foi feito${dataFmt ? ` na sua sessão de *${dataFmt}*` : ' na sua sessão de hoje'}.`,
      retornoFmt ? `` : '',
      retornoFmt ? `📅 Seu próximo retorno está previsto para *${retornoFmt}*.` : '',
      ``,
      `_Dra. Gisele Falcão_`,
    ].filter((l) => l !== '').join('\n')

    const image = image_base64.startsWith('data:') ? image_base64 : `data:image/png;base64,${image_base64}`

    const res = await fetch(`${UAZAPI_URL}/send/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
      body: JSON.stringify({ number: phone, image, caption }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return new Response(JSON.stringify({ error: 'uazapi_error', detail }), {
        status: 502, headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', ...CORS } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
})
