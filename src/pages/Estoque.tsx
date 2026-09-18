import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsAdmin } from '../hooks/useIsAdmin'
import type { Purchase, DoseRecord, EstoqueConfig, Patient, Medicamento } from '../types'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface PurchaseWithPatient extends Purchase {
  paciente_nome?: string | null
}

function parseDate(d: string) {
  return new Date(d + 'T12:00:00')
}

// Evita "ruido" de ponto flutuante tipo -1492.7399999999998
function round2(n: number) {
  return Math.round(n * 100) / 100
}

export default function Estoque() {
  const { isAdmin, loading: loadingAdmin } = useIsAdmin()
  const [purchases, setPurchases] = useState<PurchaseWithPatient[]>([])
  const [doses, setDoses] = useState<DoseRecord[]>([])
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([])
  const [config, setConfig] = useState<EstoqueConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingPurchase, setSavingPurchase] = useState(false)
  const [savingAlerta, setSavingAlerta] = useState<string | null>(null)
  const [alertaForm, setAlertaForm] = useState<Record<string, string>>({})
  const [purchaseForm, setPurchaseForm] = useState({ medicamento_id: '', data_compra: '', quantidade: '', lote: '', observacoes: '' })
  const [ajusteSaldo, setAjusteSaldo] = useState<Record<string, string>>({})
  const [savingAjuste, setSavingAjuste] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [{ data: pur }, { data: dos }, { data: cfg }, { data: patients }, { data: meds }] = await Promise.all([
      supabase.from('pronutro_purchases').select('*').order('data_compra', { ascending: false }),
      supabase.from('pronutro_dose_records').select('*'),
      supabase.from('pronutro_config').select('*').eq('id', 1).single(),
      supabase.from('pronutro_patients').select('id, nome'),
      supabase.from('pronutro_medicamentos').select('*').eq('ativo', true).order('nome'),
    ])
    const patientMap = new Map((patients ?? []).map((p: Pick<Patient, 'id' | 'nome'>) => [p.id, p.nome]))
    setPurchases((pur ?? []).map(p => ({ ...p, paciente_nome: p.patient_id ? patientMap.get(p.patient_id) ?? null : null })))
    setDoses(dos ?? [])
    setConfig(cfg ?? null)
    const medsList = meds ?? []
    setMedicamentos(medsList)
    setAlertaForm(Object.fromEntries(medsList.map((m) => [m.id, String(m.estoque_minimo ?? (m.is_principal ? cfg?.estoque_alerta_mg ?? 50 : 0))])))
    if (!purchaseForm.medicamento_id) {
      const principal = medsList.find((m) => m.is_principal) ?? medsList[0]
      if (principal) setPurchaseForm((f) => ({ ...f, medicamento_id: principal.id }))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const medicamentoPrincipal = medicamentos.find((m) => m.is_principal) ?? null

  // Um bloco de números por medicamento — nunca somar quantidade de
  // medicamentos diferentes (bug antigo: mg de Tirzepatida + unidade de
  // Vitamina D viravam um único "saldo" sem sentido).
  //
  // O "Saldo" é sempre pronutro_medicamentos.estoque_mg -- é o único contador
  // que já é debitado automaticamente quando uma dose é aplicada (via RPC
  // descontar_estoque_medicamento em Paciente.tsx). Comprado/Vendido aqui
  // embaixo são só o HISTÓRICO de compras registradas (informativo) -- antes
  // dessa correção o "Saldo" era recalculado só a partir desse histórico,
  // ignorando o contador real, o que fazia aparecer "0" pra medicamento que
  // tinha estoque inicial cadastrado direto (sem nenhuma compra registrada).
  const porMedicamento = medicamentos.map((med) => {
    const comprasDoMed = purchases.filter((p) => p.medicamento_id === med.id)
    const comprado = round2(comprasDoMed.filter((p) => !p.patient_id).reduce((acc, p) => acc + Number(p.quantidade_mg), 0))
    const alocadoPacientes = round2(comprasDoMed.filter((p) => !!p.patient_id).reduce((acc, p) => acc + Number(p.quantidade_mg), 0))
    const saldo = round2(Number(med.estoque_mg))
    const alertaMinimo = Number(alertaForm[med.id] ?? med.estoque_minimo ?? (med.is_principal ? config?.estoque_alerta_mg ?? 50 : 0))
    return { med, comprasDoMed, comprado, alocadoPacientes, saldo, alertaMinimo, emAlerta: saldo <= alertaMinimo, negativo: saldo < 0 }
  })

  // Previsão da semana só existe pro medicamento principal — é o único que
  // tem "dose semanal" (pronutro_dose_records nunca teve outro medicamento).
  const principalStats = porMedicamento.find((s) => s.med.is_principal) ?? null
  const inicioSemana = startOfWeek(new Date(), { weekStartsOn: 1 })
  const fimSemana = endOfWeek(new Date(), { weekStartsOn: 1 })
  const dentroDaSemana = (d: string | null) => {
    if (!d) return false
    const data = parseDate(d)
    return data >= inicioSemana && data <= fimSemana
  }
  const necessarioSemana = round2(doses.reduce((acc, d) => {
    if (dentroDaSemana(d.data_aplicacao)) return acc + Number(d.dose_mg ?? 0)
    if (!d.data_aplicacao && dentroDaSemana(d.proxima_data_aplicacao)) return acc + Number(d.proxima_dose_mg ?? 0)
    return acc
  }, 0))
  const cobreSemana = principalStats ? principalStats.saldo >= necessarioSemana : true

  async function savePurchase() {
    if (!purchaseForm.medicamento_id || !purchaseForm.quantidade || !purchaseForm.data_compra) return
    setSavingPurchase(true)
    const quantidade = Number(purchaseForm.quantidade)
    await supabase.from('pronutro_purchases').insert({
      patient_id: null,
      medicamento_id: purchaseForm.medicamento_id,
      data_compra: purchaseForm.data_compra,
      quantidade_mg: quantidade,
      lote: purchaseForm.lote || null,
      observacoes: purchaseForm.observacoes || null,
    })
    // Credita o contador real (mesmo usado no Financeiro e debitado na
    // aplicação de dose) -- sem isso o histórico de compra fica registrado
    // mas o saldo real nunca sobe, só desce.
    await supabase.rpc('descontar_estoque_medicamento', {
      p_medicamento_id: purchaseForm.medicamento_id,
      p_quantidade_mg: -quantidade,
    })
    setPurchaseForm((f) => ({ ...f, data_compra: '', quantidade: '', lote: '', observacoes: '' }))
    setSavingPurchase(false)
    load()
  }

  async function deletePurchase(id: string) {
    if (!confirm('Remover esta entrada de estoque?')) return
    await supabase.from('pronutro_purchases').delete().eq('id', id)
    setPurchases(prev => prev.filter(p => p.id !== id))
  }

  async function corrigirSaldo(medId: string) {
    const valor = ajusteSaldo[medId]
    if (!valor) return
    const delta = Number(valor.replace(',', '.'))
    if (Number.isNaN(delta) || delta === 0) return
    setSavingAjuste(medId)
    await supabase.rpc('descontar_estoque_medicamento', { p_medicamento_id: medId, p_quantidade_mg: -delta })
    setAjusteSaldo((a) => ({ ...a, [medId]: '' }))
    setSavingAjuste(null)
    load()
  }

  async function saveAlerta(medId: string) {
    setSavingAlerta(medId)
    await supabase.from('pronutro_medicamentos').update({ estoque_minimo: Number(alertaForm[medId]) || 0 }).eq('id', medId)
    setSavingAlerta(null)
    load()
  }

  if (loadingAdmin) return <div className="py-12 text-center text-gray-400">Carregando...</div>
  if (!isAdmin) return <Navigate to="/" replace />
  if (loading) return <div className="py-12 text-center text-gray-400">Carregando...</div>

  const medicamentoSelecionado = medicamentos.find((m) => m.id === purchaseForm.medicamento_id) ?? null
  const unidadeSelecionada = medicamentoSelecionado?.is_principal ? 'mg' : 'un'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Controle de Estoque</h1>
        <p className="text-sm text-gray-400 mt-0.5">Estoque bruto da clínica (o que foi comprado do fornecedor) menos o que já foi vendido/alocado aos pacientes — um saldo independente por medicamento.</p>
      </div>

      {porMedicamento.some((s) => s.emAlerta) && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="text-red-700 font-bold text-sm">Estoque baixo em {porMedicamento.filter((s) => s.emAlerta).length} medicamento(s)</p>
            <p className="text-red-600 text-xs mt-0.5">
              {porMedicamento.filter((s) => s.emAlerta).map((s) => s.med.nome).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Um cartão por medicamento */}
      <div className="space-y-3">
        {porMedicamento.map(({ med, comprado, alocadoPacientes, saldo, emAlerta, negativo }) => (
          <div key={med.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-700">
                {med.nome} {med.is_principal && <span className="text-xs font-normal text-gray-400">(protocolo semanal)</span>}
              </h2>
              {emAlerta && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Estoque baixo</span>}
            </div>
            {negativo && (
              <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex flex-wrap items-center gap-2">
                <span>⚠️ Saldo negativo — foi debitado mais do que entrou no sistema. Faça uma contagem física e corrija:</span>
                <input
                  type="text" placeholder="+/- valor"
                  value={ajusteSaldo[med.id] ?? ''}
                  onChange={(e) => setAjusteSaldo((a) => ({ ...a, [med.id]: e.target.value }))}
                  className="w-24 px-2 py-1 border border-red-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-red-400"
                />
                <button onClick={() => corrigirSaldo(med.id)} disabled={savingAjuste === med.id}
                  className="text-xs font-semibold text-red-700 hover:underline disabled:opacity-50">
                  {savingAjuste === med.id ? 'Salvando...' : 'Corrigir saldo'}
                </button>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                <p className="text-xs text-blue-500 font-medium mb-1">Comprado (histórico)</p>
                <p className="text-base sm:text-xl font-bold text-blue-700">{comprado} {med.is_principal ? 'mg' : 'un'}</p>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-center">
                <p className="text-xs text-orange-500 font-medium mb-1">Vendido a pacientes (histórico)</p>
                <p className="text-base sm:text-xl font-bold text-orange-700">{alocadoPacientes} {med.is_principal ? 'mg' : 'un'}</p>
              </div>
              <div className={`border rounded-xl p-3 text-center ${emAlerta ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-100'}`}>
                <p className={`text-xs font-medium mb-1 ${emAlerta ? 'text-red-500' : 'text-green-500'}`}>Saldo atual</p>
                <p className={`text-base sm:text-xl font-bold ${emAlerta ? 'text-red-700' : 'text-green-700'}`}>{saldo} {med.is_principal ? 'mg' : 'un'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <label className="text-xs text-gray-500">Alertar quando saldo cair até</label>
              <input
                type="number" step="0.5" min="0"
                value={alertaForm[med.id] ?? ''}
                onChange={(e) => setAlertaForm((f) => ({ ...f, [med.id]: e.target.value }))}
                className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <button
                onClick={() => saveAlerta(med.id)}
                disabled={savingAlerta === med.id}
                className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {savingAlerta === med.id ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        ))}
        {medicamentos.length === 0 && (
          <p className="text-sm text-gray-400 bg-white rounded-2xl border border-gray-200 p-5">Nenhum medicamento cadastrado ainda — cadastre em Financeiro.</p>
        )}
      </div>

      {/* Previsão da semana (só do medicamento principal) */}
      {medicamentoPrincipal && (
        <div className={`rounded-2xl border p-5 ${cobreSemana ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <h2 className="text-sm font-bold text-gray-700 mb-1">
            Previsão desta semana ({format(inicioSemana, 'dd/MM', { locale: ptBR })} a {format(fimSemana, 'dd/MM', { locale: ptBR })}) — {medicamentoPrincipal.nome}
          </h2>
          <p className="text-sm text-gray-600">
            Pacientes marcados ou que já tomaram essa semana precisam de <strong>{necessarioSemana} mg</strong>.
            O saldo atual é <strong>{principalStats?.saldo ?? 0} mg</strong>.
          </p>
          <p className={`text-sm font-bold mt-2 ${cobreSemana ? 'text-green-700' : 'text-red-700'}`}>
            {cobreSemana
              ? `✅ Dá — sobra ${round2((principalStats?.saldo ?? 0) - necessarioSemana)} mg depois de atender todos.`
              : `⚠️ Não dá — falta ${round2(necessarioSemana - (principalStats?.saldo ?? 0))} mg para atender todos essa semana.`}
          </p>
        </div>
      )}

      {/* Registrar entrada */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-700 mb-1">+ Registrar Compra da Clínica</h2>
        <p className="text-xs text-gray-400 mb-3">Use aqui apenas para compras do fornecedor (estoque bruto). Compras vinculadas a um paciente específico continuam sendo lançadas na página do paciente.</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Medicamento *</label>
            <select value={purchaseForm.medicamento_id}
              onChange={(e) => setPurchaseForm(f => ({ ...f, medicamento_id: e.target.value }))}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand">
              {medicamentos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Quantidade ({unidadeSelecionada}) *</label>
            <input type="number" step="0.5" placeholder="Ex: 500" value={purchaseForm.quantidade}
              onChange={(e) => setPurchaseForm(f => ({ ...f, quantidade: e.target.value }))}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Data da compra *</label>
            <input type="date" value={purchaseForm.data_compra}
              onChange={(e) => setPurchaseForm(f => ({ ...f, data_compra: e.target.value }))}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Lote</label>
            <input type="text" placeholder="AB1234" value={purchaseForm.lote}
              onChange={(e) => setPurchaseForm(f => ({ ...f, lote: e.target.value }))}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Obs</label>
            <input type="text" placeholder="Fornecedor, nota fiscal..." value={purchaseForm.observacoes}
              onChange={(e) => setPurchaseForm(f => ({ ...f, observacoes: e.target.value }))}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
        </div>
        <button onClick={savePurchase} disabled={savingPurchase || !purchaseForm.medicamento_id || !purchaseForm.quantidade || !purchaseForm.data_compra}
          className="mt-3 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
          {savingPurchase ? 'Salvando...' : '+ Registrar Compra'}
        </button>
      </div>

      {/* Histórico */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-700 mb-3">Histórico de Movimentações</h2>
        {purchases.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma entrada registrada ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {purchases.map((pur) => {
              const med = medicamentos.find((m) => m.id === pur.medicamento_id)
              const unidade = med?.is_principal === false ? 'un' : 'mg'
              return (
                <div key={pur.id} className={`flex items-start justify-between gap-2 border rounded-lg px-3 py-2 text-sm ${pur.patient_id ? 'bg-orange-50/50 border-orange-100' : 'bg-blue-50/50 border-blue-100'}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 min-w-0">
                    <span className={`font-semibold ${pur.patient_id ? 'text-orange-600' : 'text-blue-600'}`}>
                      {pur.patient_id ? '−' : '+'}{pur.quantidade_mg} {unidade}
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{med?.nome ?? 'Medicação não identificada'}</span>
                    <span className="text-gray-600">{format(parseDate(pur.data_compra), 'dd/MM/yyyy', { locale: ptBR })}</span>
                    {pur.patient_id
                      ? <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">Vendido: {pur.paciente_nome ?? 'paciente'}</span>
                      : <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Compra clínica</span>}
                    {pur.lote && <span className="text-gray-400 text-xs">Lote: {pur.lote}</span>}
                    {pur.observacoes && <span className="text-gray-400 text-xs truncate max-w-[160px]">{pur.observacoes}</span>}
                  </div>
                  <button onClick={() => deletePurchase(pur.id)} className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">✕</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
