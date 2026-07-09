import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsAdmin } from '../hooks/useIsAdmin'
import type { Purchase, DoseRecord, EstoqueConfig, Patient } from '../types'
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
  const [config, setConfig] = useState<EstoqueConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingPurchase, setSavingPurchase] = useState(false)
  const [savingAlerta, setSavingAlerta] = useState(false)
  const [alertaForm, setAlertaForm] = useState('')
  const [purchaseForm, setPurchaseForm] = useState({ data_compra: '', quantidade_mg: '', lote: '', observacoes: '' })

  async function load() {
    setLoading(true)
    const [{ data: pur }, { data: dos }, { data: cfg }, { data: patients }] = await Promise.all([
      supabase.from('pronutro_purchases').select('*').order('data_compra', { ascending: false }),
      supabase.from('pronutro_dose_records').select('*'),
      supabase.from('pronutro_config').select('*').eq('id', 1).single(),
      supabase.from('pronutro_patients').select('id, nome'),
    ])
    const patientMap = new Map((patients ?? []).map((p: Pick<Patient, 'id' | 'nome'>) => [p.id, p.nome]))
    setPurchases((pur ?? []).map(p => ({ ...p, paciente_nome: p.patient_id ? patientMap.get(p.patient_id) ?? null : null })))
    setDoses(dos ?? [])
    setConfig(cfg ?? null)
    setAlertaForm(cfg ? String(cfg.estoque_alerta_mg) : '50')
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Estoque bruto = o que a clínica comprou do fornecedor (entradas gerais, sem paciente vinculado)
  const estoqueBruto = round2(purchases.filter(p => !p.patient_id).reduce((acc, p) => acc + Number(p.quantidade_mg), 0))
  // Vendido/alocado a pacientes = o que já foi "vendido" a cada paciente, sai do estoque bruto da clínica
  const vendidoPacientes = round2(purchases.filter(p => !!p.patient_id).reduce((acc, p) => acc + Number(p.quantidade_mg), 0))
  const saldo = round2(estoqueBruto - vendidoPacientes)
  const alertaMg = config?.estoque_alerta_mg ?? 50
  const emAlerta = saldo <= alertaMg

  // Previsão da semana: pacientes com dose aplicada OU marcada (próxima aplicação) dentro da semana atual
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
  const cobreSemana = saldo >= necessarioSemana

  async function savePurchase() {
    if (!purchaseForm.quantidade_mg || !purchaseForm.data_compra) return
    setSavingPurchase(true)
    await supabase.from('pronutro_purchases').insert({
      patient_id: null,
      data_compra: purchaseForm.data_compra,
      quantidade_mg: Number(purchaseForm.quantidade_mg),
      lote: purchaseForm.lote || null,
      observacoes: purchaseForm.observacoes || null,
    })
    setPurchaseForm({ data_compra: '', quantidade_mg: '', lote: '', observacoes: '' })
    setSavingPurchase(false)
    load()
  }

  async function deletePurchase(id: string) {
    if (!confirm('Remover esta entrada de estoque?')) return
    await supabase.from('pronutro_purchases').delete().eq('id', id)
    setPurchases(prev => prev.filter(p => p.id !== id))
  }

  async function saveAlerta() {
    setSavingAlerta(true)
    await supabase.from('pronutro_config').update({ estoque_alerta_mg: Number(alertaForm) || 0 }).eq('id', 1)
    setSavingAlerta(false)
    load()
  }

  if (loadingAdmin) return <div className="py-12 text-center text-gray-400">Carregando...</div>
  if (!isAdmin) return <Navigate to="/" replace />
  if (loading) return <div className="py-12 text-center text-gray-400">Carregando...</div>

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Controle de Estoque — Tirzepatida</h1>
        <p className="text-sm text-gray-400 mt-0.5">Estoque bruto da clínica (o que foi comprado do fornecedor) menos o que já foi vendido/alocado aos pacientes.</p>
      </div>

      {emAlerta && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="text-red-700 font-bold text-sm">Estoque baixo — hora de comprar mais!</p>
            <p className="text-red-600 text-xs mt-0.5">Saldo atual ({saldo} mg) está no alerta mínimo configurado ({alertaMg} mg) ou abaixo.</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 sm:p-4 text-center">
          <p className="text-xs text-blue-500 font-medium mb-1">Estoque bruto (fornecedor)</p>
          <p className="text-lg sm:text-2xl font-bold text-blue-700">{estoqueBruto} mg</p>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 sm:p-4 text-center">
          <p className="text-xs text-orange-500 font-medium mb-1">Vendido a pacientes</p>
          <p className="text-lg sm:text-2xl font-bold text-orange-700">{vendidoPacientes} mg</p>
        </div>
        <div className={`border rounded-xl p-3 sm:p-4 text-center ${emAlerta ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-100'}`}>
          <p className={`text-xs font-medium mb-1 ${emAlerta ? 'text-red-500' : 'text-green-500'}`}>Saldo da clínica</p>
          <p className={`text-lg sm:text-2xl font-bold ${emAlerta ? 'text-red-700' : 'text-green-700'}`}>{saldo} mg</p>
        </div>
      </div>

      {/* Previsão da semana */}
      <div className={`rounded-2xl border p-5 ${cobreSemana ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <h2 className="text-sm font-bold text-gray-700 mb-1">
          Previsão desta semana ({format(inicioSemana, 'dd/MM', { locale: ptBR })} a {format(fimSemana, 'dd/MM', { locale: ptBR })})
        </h2>
        <p className="text-sm text-gray-600">
          Pacientes marcados ou que já tomaram essa semana precisam de <strong>{necessarioSemana} mg</strong>.
          O saldo atual da clínica é <strong>{saldo} mg</strong>.
        </p>
        <p className={`text-sm font-bold mt-2 ${cobreSemana ? 'text-green-700' : 'text-red-700'}`}>
          {cobreSemana
            ? `✅ Dá — sobra ${(saldo - necessarioSemana).toFixed(2)} mg depois de atender todos.`
            : `⚠️ Não dá — falta ${(necessarioSemana - saldo).toFixed(2)} mg para atender todos essa semana.`}
        </p>
      </div>

      {/* Alerta mínimo */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-700 mb-3">Alertar quando o saldo cair até</h2>
        <div className="flex gap-2">
          <input
            type="number" step="0.5" min="0"
            value={alertaForm}
            onChange={e => setAlertaForm(e.target.value)}
            className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <span className="text-sm text-gray-500 self-center">mg</span>
          <button
            onClick={saveAlerta}
            disabled={savingAlerta}
            className="ml-2 bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-50"
          >
            {savingAlerta ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Registrar entrada */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-700 mb-1">+ Registrar Compra da Clínica</h2>
        <p className="text-xs text-gray-400 mb-3">Use aqui apenas para compras do fornecedor (estoque bruto). Compras vinculadas a um paciente específico continuam sendo lançadas na página do paciente.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Data da compra *</label>
            <input type="date" value={purchaseForm.data_compra}
              onChange={(e) => setPurchaseForm(f => ({ ...f, data_compra: e.target.value }))}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Quantidade (mg) *</label>
            <input type="number" step="0.5" placeholder="Ex: 500" value={purchaseForm.quantidade_mg}
              onChange={(e) => setPurchaseForm(f => ({ ...f, quantidade_mg: e.target.value }))}
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
        <button onClick={savePurchase} disabled={savingPurchase || !purchaseForm.quantidade_mg || !purchaseForm.data_compra}
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
            {purchases.map((pur) => (
              <div key={pur.id} className={`flex items-start justify-between gap-2 border rounded-lg px-3 py-2 text-sm ${pur.patient_id ? 'bg-orange-50/50 border-orange-100' : 'bg-blue-50/50 border-blue-100'}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 min-w-0">
                  <span className={`font-semibold ${pur.patient_id ? 'text-orange-600' : 'text-blue-600'}`}>
                    {pur.patient_id ? '−' : '+'}{pur.quantidade_mg} mg
                  </span>
                  <span className="text-gray-600">{format(parseDate(pur.data_compra), 'dd/MM/yyyy', { locale: ptBR })}</span>
                  {pur.patient_id
                    ? <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">Vendido: {pur.paciente_nome ?? 'paciente'}</span>
                    : <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Compra clínica</span>}
                  {pur.lote && <span className="text-gray-400 text-xs">Lote: {pur.lote}</span>}
                  {pur.observacoes && <span className="text-gray-400 text-xs truncate max-w-[160px]">{pur.observacoes}</span>}
                </div>
                <button onClick={() => deletePurchase(pur.id)} className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
