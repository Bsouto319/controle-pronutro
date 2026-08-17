import type { DoseRecord } from '../types'

export function ultimaAplicadaNoCiclo(doses: DoseRecord[], cicloAtual: number): DoseRecord | null {
  const aplicadas = doses.filter((d) => d.ciclo === cicloAtual && d.data_aplicacao)
  return [...aplicadas].sort((a, b) => b.semana - a.semana)[0] ?? null
}

// No-show ainda em aberto: a ultima dose aplicada foi marcada como no-show
// e o paciente ainda nao veio na semana seguinte (senao a equipe ja teria preenchido data_aplicacao).
export function isNoShowPendente(doses: DoseRecord[], cicloAtual: number): boolean {
  const noCiclo = doses.filter((d) => d.ciclo === cicloAtual)
  const ultima = ultimaAplicadaNoCiclo(doses, cicloAtual)
  if (!ultima?.no_show) return false
  const proxima = noCiclo.find((d) => d.semana === ultima.semana + 1)
  return !proxima?.data_aplicacao
}
