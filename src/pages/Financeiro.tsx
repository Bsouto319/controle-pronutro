import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsAdmin } from '../hooks/useIsAdmin'
import type { Pagamento, Patient, Medicamento } from '../types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import ImportPagamentosCSVModal from '../components/ImportPagamentosCSVModal'
import { normalizeText } from '../lib/normalize'

interface PagamentoComPaciente extends Pagamento {
  paciente_nome?: string
}

const FORMAS = [
  { value: 'pix', label: 'Pix' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_credito', label: 'Cartão crédito' },
  { value: 'cartao_debito', label: 'Cartão débito' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'b16', label: 'B16' },
  { value: 'pronutro', label: 'ProNutro' },
]

const REFERENTES = [
  { value: 'consulta', label: 'Consulta' },
  { value: 'protocolo', label: 'Protocolo' },
  { value: 'mensalidade', label: 'Mensalidade' },
  { value: 'produto', label: 'Produto' },
  { value: 'outro', label: 'Outro' },
]

function fmtMoney(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Financeiro() {
  const [searchParams] = useSearchParams()
  const { isAdmin, loading: loadingAdmin } = useIsAdmin()
  const [pagamentos, setPagamentos] = useState<PagamentoComPaciente[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showEstoqueMed, setShowEstoqueMed] = useState(false)
  const [novoMedNome, setNovoMedNome] = useState('')
  const [novoMedEstoque, setNovoMedEstoque] = useState('')
  const [savingMed, setSavingMed] = useState(false)
  const [ajusteEstoque, setAjusteEstoque] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pago' | 'pendente' | 'cancelado'>('todos')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [patientSearch, setPatientSearch] = useState('')
  const [showPatientDropdown, setShowPatientDropdown] = useState(false)
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)

  const [form, setForm] = useState({
    patient_id: '',
    valor: '',
    data_pagamento: format(new Date(), 'yyyy-MM-dd'),
    forma_pagamento: 'pix',
    referente_a: 'consulta',
    status: 'pago' as 'pago' | 'pendente' | 'cancelado',
    observacoes: '',
    medicamento_id: '',
    quantidade_mg: '',
  })

  async function load() {
    setLoading(true)
    const [{ data: pags }, { data: pts }, { data: meds }] = await Promise.all([
      supabase.from('pronutro_pagamentos').select('*').order('data_pagamento', { ascending: false }),
      supabase.from('pronutro_patients').select('*').order('nome'),
      supabase.from('pronutro_medicamentos').select('*').order('nome'),
    ])
    const patientsList = pts ?? []
    setPatients(patientsList)
    setMedicamentos(meds ?? [])
    setPagamentos(
      (pags ?? []).map((p) => ({
        ...p,
        paciente_nome: patientsList.find((pt) => pt.id === p.patient_id)?.nome ?? '—',
      }))
    )
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const pacienteId = searchParams.get('paciente')
    if (!pacienteId || patients.length === 0) return
    const p = patients.find((pt) => pt.id === pacienteId)
    if (!p) return
    setForm((f) => ({ ...f, patient_id: p.id }))
    setPatientSearch(p.nome)
    setShowForm(true)
    setTimeout(() => document.getElementById('form-novo-pagamento')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients, searchParams])

  async function savePagamento() {
    if (!form.patient_id || !form.valor || !form.data_pagamento) return
    if (form.medicamento_id && !form.quantidade_mg) {
      alert('Informe quantos mg foram comprados dessa medicação.')
      return
    }
    setSaving(true)
    const quantidadeMg = form.quantidade_mg ? Number(form.quantidade_mg.replace(',', '.')) : null

    const { error } = await supabase.from('pronutro_pagamentos').insert({
      patient_id: form.patient_id,
      valor: Number(form.valor.replace(',', '.')),
      data_pagamento: form.data_pagamento,
      forma_pagamento: form.forma_pagamento,
      referente_a: form.referente_a,
      status: form.status,
      observacoes: form.observacoes || null,
      medicamento_id: form.medicamento_id || null,
      quantidade_mg: quantidadeMg,
    })
    if (error) {
      setSaving(false)
      alert('Erro ao salvar pagamento: ' + error.message)
      console.error('savePagamento', error)
      return
    }

    // Pagamento referente a medicação: entra no estoque do paciente e desconta do estoque geral
    if (form.medicamento_id && quantidadeMg) {
      const { error: purchaseError } = await supabase.from('pronutro_purchases').insert({
        patient_id: form.patient_id,
        data_compra: form.data_pagamento,
        quantidade_mg: quantidadeMg,
        medicamento_id: form.medicamento_id,
        observacoes: 'Lançado automaticamente via Financeiro',
      })
      if (purchaseError) {
        console.error('savePagamento (purchase)', purchaseError)
        alert('Pagamento salvo, mas houve erro ao registrar a entrada no estoque do paciente: ' + purchaseError.message)
      }
      const { error: estoqueError } = await supabase.rpc('descontar_estoque_medicamento', {
        p_medicamento_id: form.medicamento_id,
        p_quantidade_mg: quantidadeMg,
      })
      if (estoqueError) {
        console.error('savePagamento (estoque)', estoqueError)
        alert('Pagamento salvo, mas houve erro ao descontar do estoque geral: ' + estoqueError.message)
      }
    }

    setSaving(false)
    setForm({
      patient_id: '', valor: '', data_pagamento: format(new Date(), 'yyyy-MM-dd'),
      forma_pagamento: 'pix', referente_a: 'consulta', status: 'pago', observacoes: '',
      medicamento_id: '', quantidade_mg: '',
    })
    setPatientSearch('')
    setShowForm(false)
    load()
  }

  async function saveMedicamento() {
    if (!novoMedNome.trim()) return
    setSavingMed(true)
    const { error } = await supabase.from('pronutro_medicamentos').insert({
      nome: novoMedNome.trim(),
      estoque_mg: novoMedEstoque ? Number(novoMedEstoque.replace(',', '.')) : 0,
    })
    setSavingMed(false)
    if (error) {
      alert('Erro ao cadastrar medicação: ' + error.message)
      return
    }
    setNovoMedNome('')
    setNovoMedEstoque('')
    load()
  }

  async function ajustarEstoque(medId: string) {
    const valor = ajusteEstoque[medId]
    if (!valor) return
    const delta = Number(valor.replace(',', '.'))
    if (Number.isNaN(delta) || delta === 0) return
    const { error } = await supabase.rpc('descontar_estoque_medicamento', {
      p_medicamento_id: medId,
      p_quantidade_mg: -delta,
    })
    if (error) {
      alert('Erro ao ajustar estoque: ' + error.message)
      return
    }
    setAjusteEstoque((a) => ({ ...a, [medId]: '' }))
    load()
  }

  async function updateStatus(id: string, status: 'pago' | 'pendente' | 'cancelado') {
    const { error } = await supabase.from('pronutro_pagamentos').update({ status }).eq('id', id)
    if (error) { alert('Erro ao atualizar status: ' + error.message); return }
    setPagamentos((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)))
  }

  async function deletePagamento(id: string) {
    if (!confirm('Apagar este lançamento financeiro?')) return
    const { error } = await supabase.from('pronutro_pagamentos').delete().eq('id', id)
    if (error) { alert('Erro ao apagar: ' + error.message); return }
    setPagamentos((prev) => prev.filter((p) => p.id !== id))
  }

  function exportCSV() {
    const rows = [
      ['Paciente', 'Valor', 'Data', 'Forma', 'Referente a', 'Status', 'Observações'],
      ...filtered.map((p) => [
        p.paciente_nome ?? '',
        p.valor.toFixed(2).replace('.', ','),
        format(new Date(p.data_pagamento + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }),
        FORMAS.find((f) => f.value === p.forma_pagamento)?.label ?? p.forma_pagamento,
        REFERENTES.find((r) => r.value === p.referente_a)?.label ?? p.referente_a,
        p.status,
        p.observacoes ?? '',
      ]),
    ]
    const csv = 'sep=;\n' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `financeiro-pronutro-${format(new Date(), 'dd-MM-yyyy')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = pagamentos.filter((p) => {
    if (statusFilter !== 'todos' && p.status !== statusFilter) return false
    if (search && !normalizeText(p.paciente_nome ?? '').includes(normalizeText(search))) return false
    if (dataInicio && p.data_pagamento < dataInicio) return false
    if (dataFim && p.data_pagamento > dataFim) return false
    return true
  })

  const totalPago = filtered.filter((p) => p.status === 'pago').reduce((acc, p) => acc + Number(p.valor), 0)
  const totalPendente = filtered.filter((p) => p.status === 'pendente').reduce((acc, p) => acc + Number(p.valor), 0)

  if (loadingAdmin) return <div className="py-12 text-center text-gray-400">Carregando...</div>
  if (!isAdmin) return <Navigate to="/" replace />
  if (loading) return <div className="py-12 text-center text-gray-400">Carregando...</div>

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Financeiro</h1>
          <p className="text-sm text-gray-400 mt-0.5">Controle de pagamentos — quem pagou, quando e quanto.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 border border-gray-200 text-gray-600 px-3 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors font-medium bg-white">
            ↑ <span className="hidden sm:inline">Importar</span> Planilha
          </button>
          <button onClick={exportCSV} className="flex items-center gap-1.5 border border-gray-200 text-gray-600 px-3 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors font-medium bg-white">
            ↓ <span className="hidden sm:inline">Exportar</span> CSV
          </button>
          <button onClick={() => setShowEstoqueMed((v) => !v)} className="flex items-center gap-1.5 border border-gray-200 text-gray-600 px-3 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors font-medium bg-white">
            💊 <span className="hidden sm:inline">Estoque</span> Medicações
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 bg-brand text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-dark transition-colors shadow-sm"
          >
            + Novo Pagamento
          </button>
        </div>
      </div>

      {showImport && (
        <ImportPagamentosCSVModal
          patients={patients}
          onClose={() => setShowImport(false)}
          onSuccess={() => { setShowImport(false); load() }}
        />
      )}

      {showEstoqueMed && (
        <div className="bg-white rounded-2xl border-2 border-blue-300 p-5 shadow-md space-y-4">
          <h2 className="text-sm font-bold text-gray-700">💊 Estoque de Medicações (clínica)</h2>
          {medicamentos.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma medicação cadastrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {medicamentos.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2 text-sm">
                  <div>
                    <span className="font-semibold text-gray-800">{m.nome}</span>
                    <span className="text-gray-400 mx-1.5">·</span>
                    <span className={m.estoque_mg <= 0 ? 'text-red-600 font-medium' : 'text-gray-600'}>{m.estoque_mg} mg em estoque</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="+/- mg"
                      value={ajusteEstoque[m.id] ?? ''}
                      onChange={(e) => setAjusteEstoque((a) => ({ ...a, [m.id]: e.target.value }))}
                      className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                    <button onClick={() => ajustarEstoque(m.id)} className="text-xs font-medium text-brand hover:underline">
                      Ajustar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-gray-100 pt-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Nova medicação</label>
              <input type="text" placeholder="Ex: Semaglutida" value={novoMedNome}
                onChange={(e) => setNovoMedNome(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Estoque inicial (mg)</label>
              <input type="text" placeholder="0" value={novoMedEstoque}
                onChange={(e) => setNovoMedEstoque(e.target.value)}
                className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <button onClick={saveMedicamento} disabled={savingMed || !novoMedNome.trim()}
              className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
              {savingMed ? 'Salvando...' : '+ Cadastrar'}
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center shadow-sm">
          <div className="text-xl sm:text-2xl font-bold text-green-700">{fmtMoney(totalPago)}</div>
          <div className="text-xs text-green-600 mt-0.5">Recebido (filtro atual)</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center shadow-sm">
          <div className="text-xl sm:text-2xl font-bold text-amber-600">{fmtMoney(totalPendente)}</div>
          <div className="text-xs text-amber-600 mt-0.5">Pendente (filtro atual)</div>
        </div>
      </div>

      {/* Form novo pagamento */}
      {showForm && (
        <div id="form-novo-pagamento" className="bg-white rounded-2xl border-2 border-brand p-5 shadow-md space-y-4 scroll-mt-24">
          <h2 className="text-sm font-bold text-gray-700">+ Novo pagamento</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="col-span-2 sm:col-span-1 relative">
              <label className="text-xs text-gray-500 block mb-1">Paciente *</label>
              <input
                type="text"
                placeholder="Digite pra buscar..."
                value={patientSearch}
                onChange={(e) => { setPatientSearch(e.target.value); setForm((f) => ({ ...f, patient_id: '' })); setShowPatientDropdown(true) }}
                onFocus={() => setShowPatientDropdown(true)}
                onBlur={() => setTimeout(() => setShowPatientDropdown(false), 150)}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              />
              {showPatientDropdown && patientSearch && (
                <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                  {patients
                    .filter((p) => p.nome.toLowerCase().includes(patientSearch.toLowerCase()))
                    .slice(0, 20)
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setForm((f) => ({ ...f, patient_id: p.id })); setPatientSearch(p.nome); setShowPatientDropdown(false) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-brand/10 transition-colors"
                      >
                        {p.nome}
                      </button>
                    ))}
                  {patients.filter((p) => p.nome.toLowerCase().includes(patientSearch.toLowerCase())).length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400">Nenhum paciente encontrado.</p>
                  )}
                </div>
              )}
              {form.patient_id && <p className="text-xs text-green-600 mt-1">✓ Selecionado</p>}
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Valor (R$) *</label>
              <input type="text" placeholder="Ex: 350,00" value={form.valor}
                onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Data *</label>
              <input type="date" value={form.data_pagamento}
                onChange={(e) => setForm((f) => ({ ...f, data_pagamento: e.target.value }))}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Forma de pagamento</label>
              <select value={form.forma_pagamento} onChange={(e) => setForm((f) => ({ ...f, forma_pagamento: e.target.value }))}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand">
                {FORMAS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Referente a</label>
              <select value={form.referente_a} onChange={(e) => setForm((f) => ({ ...f, referente_a: e.target.value }))}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand">
                {REFERENTES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Medicação (opcional)</label>
              <select value={form.medicamento_id} onChange={(e) => setForm((f) => ({ ...f, medicamento_id: e.target.value }))}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand">
                <option value="">Nenhuma</option>
                {medicamentos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            {form.medicamento_id && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Quantidade comprada (mg) *</label>
                <input type="text" placeholder="Ex: 2,5" value={form.quantidade_mg}
                  onChange={(e) => setForm((f) => ({ ...f, quantidade_mg: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
                <p className="text-[11px] text-gray-400 mt-1">Entra no estoque do paciente e desconta do estoque geral.</p>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as typeof form.status }))}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand">
                <option value="pago">Pago</option>
                <option value="pendente">Pendente</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className="text-xs text-gray-500 block mb-1">Observações</label>
              <input type="text" placeholder="Opcional" value={form.observacoes}
                onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={savePagamento} disabled={saving || !form.patient_id || !form.valor || !form.data_pagamento}
              className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar pagamento'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Buscar paciente pra lançar pagamento ou filtrar histórico..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setShowSearchDropdown(true)}
            onBlur={() => setTimeout(() => setShowSearchDropdown(false), 150)}
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 bg-white"
          />
          {showSearchDropdown && search && (
            <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg">
              {patients.filter((p) => normalizeText(p.nome).includes(normalizeText(search))).length > 0 && (
                <p className="text-xs text-gray-400 px-3 pt-2 pb-1">Pacientes cadastrados:</p>
              )}
              {patients
                .filter((p) => p.nome.toLowerCase().includes(search.toLowerCase()))
                .slice(0, 8)
                .map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-brand/5">
                    <span className="text-sm text-gray-700 truncate">{p.nome}</span>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setForm((f) => ({ ...f, patient_id: p.id }))
                        setPatientSearch(p.nome)
                        setShowForm(true)
                        setShowSearchDropdown(false)
                        setTimeout(() => document.getElementById('form-novo-pagamento')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
                      }}
                      className="flex-shrink-0 text-xs font-semibold text-white bg-brand px-2.5 py-1 rounded-lg hover:bg-brand-dark transition-colors"
                    >
                      + Lançar pagamento
                    </button>
                  </div>
                ))}
              {patients.filter((p) => normalizeText(p.nome).includes(normalizeText(search))).length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">Nenhum paciente cadastrado com esse nome.</p>
              )}
            </div>
          )}
        </div>
        <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}
          title="De" className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white" />
        <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)}
          title="Até" className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white">
          <option value="todos">Todos os status</option>
          <option value="pago">Pago</option>
          <option value="pendente">Pendente</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>

      {/* Tabela */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="text-4xl mb-3">💰</div>
          <p className="text-gray-600 font-medium">Nenhum pagamento encontrado</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-brand to-brand-dark text-white">
                <th className="text-left px-4 py-3 font-semibold">Paciente</th>
                <th className="text-left px-4 py-3 font-semibold">Valor</th>
                <th className="text-left px-4 py-3 font-semibold">Data</th>
                <th className="text-left px-4 py-3 font-semibold">Forma</th>
                <th className="text-left px-4 py-3 font-semibold">Referente</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-green-50/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">{p.paciente_nome}</td>
                  <td className="px-4 py-3 text-gray-700 font-semibold">{fmtMoney(Number(p.valor))}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{format(new Date(p.data_pagamento + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{FORMAS.find((f) => f.value === p.forma_pagamento)?.label ?? p.forma_pagamento}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{REFERENTES.find((r) => r.value === p.referente_a)?.label ?? p.referente_a}</td>
                  <td className="px-4 py-3">
                    <select
                      value={p.status}
                      onChange={(e) => updateStatus(p.id, e.target.value as 'pago' | 'pendente' | 'cancelado')}
                      className="text-xs border-0 bg-transparent focus:outline-none cursor-pointer"
                    >
                      <option value="pago">✓ Pago</option>
                      <option value="pendente">⏳ Pendente</option>
                      <option value="cancelado">✕ Cancelado</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => deletePagamento(p.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
