import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const UAZAPI_URL = 'https://btechsoutoshop.uazapi.com'
const UAZAPI_TOKEN = '5efd90a1-116b-4c86-b715-7bac2fab658a'

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) return '55' + digits
  if (digits.length === 13 && digits.startsWith('55')) return digits
  return digits
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const target = new Date()
  target.setDate(target.getDate() + 2)
  const dateStr = target.toISOString().split('T')[0]

  const { data: records, error } = await supabase
    .from('pronutro_dose_records')
    .select('patient_id, proxima_dose_mg, semana, proxima_data_aplicacao, pronutro_patients!inner(nome, telefone, ativo)')
    .eq('proxima_data_aplicacao', dateStr)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const byPatient = new Map<string, typeof records[0]>()
  for (const r of records ?? []) {
    const p = r.pronutro_patients as { nome: string; telefone: string; ativo: boolean } | null
    if (!p?.telefone || p.ativo === false) continue
    const prev = byPatient.get(r.patient_id)
    if (!prev || r.semana > prev.semana) byPatient.set(r.patient_id, r)
  }

  const toRemind = Array.from(byPatient.values())

  const results = await Promise.allSettled(
    toRemind.map(async (r) => {
      const p = r.pronutro_patients as { nome: string; telefone: string }
      const phone = formatPhone(p.telefone)
      const dataFormatada = new Date(r.proxima_data_aplicacao + 'T12:00:00').toLocaleDateString('pt-BR')
      const doseStr = r.proxima_dose_mg ? `${r.proxima_dose_mg}mg` : ''

      const msg = [
        `Ola, *${p.nome}*!`,
        ``,
        `Sua proxima aplicacao${doseStr ? ` de *${doseStr}*` : ''} esta marcada para *${dataFormatada}*.`,
        ``,
        `Confirme sua presenca ou entre em contato com a clinica.`,
        ``,
        `_ProNutro - Nutrologia e Terapias Integrativas_`,
      ].join('\n')

      const res = await fetch(`${UAZAPI_URL}/send/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': UAZAPI_TOKEN },
        body: JSON.stringify({ number: phone, text: msg }),
      })

      return { patient: p.nome, phone, ok: res.ok, status: res.status }
    })
  )

  return new Response(
    JSON.stringify({ date: dateStr, total: toRemind.length, results: results.map(r => r.status === 'fulfilled' ? r.value : { error: String(r.reason) }) }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
