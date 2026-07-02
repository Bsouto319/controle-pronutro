import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Purchase, DoseRecord, EstoqueConfig, Patient } from '../types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface PurchaseWithPatient extends Purchase {
  paciente_nome?: string | null
}

export default function Estoque() {
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
      supabase.from('pronutro_dose_records').select('*').not('data_aplicacao', 'is', null),
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

  const totalComprado = purchases.reduce((acc, p) => acc + Number(p.quantidade_mg), 0)
  const totalAplicado = doses.reduce((acc, d) => acc + Number(d.dose_mg ?? 0), 0)
  const saldo = totalComprado - totalAplicado
  const alertaMg = config?.estoque_alerta_mg ?? 50
  const emAlerta = saldo <= alertaMg

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

  if (loading) return <div className="py-12 text-center text-gray-400">Carregando...</div>

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Controle de Estoque — Tirzepatida</h1>
        <p className="text-sm text-gray-400 mt-0.5">Estoque geral da clínica (todas as compras e aplicações).</p>
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
          <p className="text-xs text-blue-500 font-medium mb-1">Comprado</p>
          <p className="text-lg sm:text-2xl font-bold text-blue-700">{totalComprado} mg</p>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 sm:p-4 text-center">
          <p className="text-xs text-orange-500 font-medium mb-1">Aplicado</p>
          <p className="text-lg sm:text-2xl font-bold text-orange-700">{totalAplicado} mg</p>
        </div>
        <div className={`border rounded-xl p-3 sm:p-4 text-center ${emAlerta ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-100'}`}>
          <p className={`text-xs font-medium mb-1 ${emAlerta ? 'text-red-500' : 'text-green-500'}`}>Saldo</p>
          <p className={`text-lg sm:text-2xl font-bold ${emAlerta ? 'text-red-700' : 'text-green-700'}`}>{saldo} mg</p>
        </div>
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
        <h2 className="text-sm font-bold text-gray-700 mb-3">+ Registrar Nova Entrada</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Data da compra *</label>
            <input type="date" value={purchaseForm.data_compra}
              onChange={(e) => setPurchaseForm(f => ({ ...f, data_compra: e.target.value }))}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Quantidade (mg) *</label>
            <input type="number" step="0.5" placeholder="Ex: 100" value={purchaseForm.quantidade_mg}
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
          {savingPurchase ? 'Salvando...' : '+ Registrar Entrada'}
        </button>
      </div>

      {/* Histórico */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-700 mb-3">Histórico de Entradas</h2>
        {purchases.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma entrada registrada ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {purchases.map((pur) => (
              <div key={pur.id} className="flex items-start justify-between gap-2 bg-blue-50/50 border border-blue-100 rounded-lg px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 min-w-0">
                  <span className="text-blue-600 font-semibold">+{pur.quantidade_mg} mg</span>
                  <span className="text-gray-600">{format(new Date(pur.data_compra + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}</span>
                  {pur.paciente_nome && <span className="text-gray-400 text-xs">Paciente: {pur.paciente_nome}</span>}
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
