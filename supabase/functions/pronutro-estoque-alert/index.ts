import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const UAZAPI_URL = 'https://btechsoutoshop.uazapi.com'
const UAZAPI_TOKEN = '5efd90a1-116b-4c86-b715-7bac2fab658a'
const GERENTE_PHONE = '5561981554906'

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const [{ data: purchases }, { data: config }] = await Promise.all([
    supabase.from('pronutro_purchases').select('quantidade_mg, patient_id'),
    supabase.from('pronutro_config').select('estoque_alerta_mg').eq('id', 1).single(),
  ])

  const estoqueBruto = (purchases ?? []).filter(p => !p.patient_id).reduce((acc, p) => acc + Number(p.quantidade_mg ?? 0), 0)
  const vendidoPacientes = (purchases ?? []).filter(p => !!p.patient_id).reduce((acc, p) => acc + Number(p.quantidade_mg ?? 0), 0)
  const saldo = estoqueBruto - vendidoPacientes
  const alertaMg = Number(config?.estoque_alerta_mg ?? 50)

  if (saldo > alertaMg) {
    return new Response(JSON.stringify({ alerted: false, saldo, alertaMg }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const msg = [
    `⚠️ *Alerta de Estoque - ProNutro*`,
    ``,
    `O saldo bruto de tirzepatida da clinica esta em *${saldo} mg*, no limite de alerta (${alertaMg} mg) ou abaixo.`,
    ``,
    `Por favor, providencie a compra de mais medicamento junto ao fornecedor.`,
  ].join('\n')

  const res = await fetch(`${UAZAPI_URL}/send/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
    body: JSON.stringify({ number: GERENTE_PHONE, text: msg }),
  })

  return new Response(JSON.stringify({ alerted: true, saldo, alertaMg, status: res.status }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
