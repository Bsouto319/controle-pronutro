import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Lembrete automatico de retorno pro Passaporte de Tratamento (Dra. Gisele) —
// mesmo mecanismo do send-dose-reminder do ProNutro, so que dispara 2x:
// 1 semana antes e 1 dia antes da data_retorno (em vez de uma vez so, 2 dias antes).
const UAZAPI_URL = 'https://btechsoutoshop.uazapi.com'
const UAZAPI_TOKEN = '5efd90a1-116b-4c86-b715-7bac2fab658a'

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) return '55' + digits
  if (digits.length === 13 && digits.startsWith('55')) return digits
  return digits
}

function targetDate(daysAhead: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  return d.toISOString().split('T')[0]
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const alvos = [
    { dias: 7, label: '1 semana' },
    { dias: 1, label: '1 dia' },
  ]

  const resumo: Record<string, unknown> = {}

  for (const alvo of alvos) {
    const dateStr = targetDate(alvo.dias)

    const { data: sessoes, error } = await supabase
      .from('gisele_sessoes')
      .select('patient_id, numero_sessao, data_retorno, gisele_patients!inner(nome, telefone, ativo)')
      .eq('data_retorno', dateStr)

    if (error) {
      resumo[alvo.label] = { error: error.message }
      continue
    }

    const byPatient = new Map<string, typeof sessoes[0]>()
    for (const s of sessoes ?? []) {
      const p = s.gisele_patients as { nome: string; telefone: string; ativo: boolean } | null
      if (!p?.telefone || p.ativo === false) continue
      const prev = byPatient.get(s.patient_id)
      if (!prev || s.numero_sessao > prev.numero_sessao) byPatient.set(s.patient_id, s)
    }

    const toRemind = Array.from(byPatient.values())

    const results = await Promise.allSettled(
      toRemind.map(async (s) => {
        const p = s.gisele_patients as { nome: string; telefone: string }
        const phone = formatPhone(p.telefone)
        const dataFormatada = new Date(s.data_retorno + 'T12:00:00').toLocaleDateString('pt-BR')

        const msg = [
          `Ola, *${p.nome}*!`,
          ``,
          `Passando pra lembrar: seu proximo retorno no Passaporte de Tratamento esta marcado para *${dataFormatada}* (daqui a ${alvo.label}).`,
          ``,
          `Confirme sua presenca ou entre em contato com a clinica.`,
          ``,
          `_Dra. Gisele Falcao_`,
        ].join('\n')

        const res = await fetch(`${UAZAPI_URL}/send/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'token': UAZAPI_TOKEN },
          body: JSON.stringify({ number: phone, text: msg }),
        })

        return { patient: p.nome, phone, ok: res.ok, status: res.status }
      })
    )

    resumo[alvo.label] = {
      date: dateStr,
      total: toRemind.length,
      results: results.map(r => r.status === 'fulfilled' ? r.value : { error: String(r.reason) }),
    }
  }

  return new Response(JSON.stringify(resumo), { headers: { 'Content-Type': 'application/json' } })
})
