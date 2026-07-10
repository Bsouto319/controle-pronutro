import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsAdmin } from '../hooks/useIsAdmin'
import type { Pagamento, Patient } from '../types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import ImportPagamentosCSVModal from '../components/ImportPagamentosCSVModal'

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
  const { isAdmin, loading: loadingAdmin } = useIsAdmin()
  const [pagamentos, setPagamentos] = useState<PagamentoComPaciente[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
  })

  async function load() {
    setLoading(true)
    const [{ data: pags }, { data: pts }] = await Promise.all([
      supabase.from('pronutro_pagamentos').select('*').order('data_pagamento', { ascending: false }),
      supabase.from('pronutro_patients').select('*').order('nome'),
    ])
    const patientsList = pts ?? []
    setPatients(patientsList)
    setPagamentos(
      (pags ?? []).map((p) => ({
        ...p,
        paciente_nome: patientsList.find((pt) => pt.id === p.patient_id)?.nome ?? '—',
      }))
    )
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function savePagamento() {
    if (!form.patient_id || !form.valor || !form.data_pagamento) return
    setSaving(true)
    await supabase.from('pronutro_pagamentos').insert({
      patient_id: form.patient_id,
      valor: Number(form.valor.replace(',', '.')),
      data_pagamento: form.data_pagamento,
      forma_pagamento: form.forma_pagamento,
      referente_a: form.referente_a,
      status: form.status,
      observacoes: form.observacoes || null,
    })
    setForm({
      patient_id: '', valor: '', data_pagamento: format(new Date(), 'yyyy-MM-dd'),
      forma_pagamento: 'pix', referente_a: 'consulta', status: 'pago', observacoes: '',
    })
    setPatientSearch('')
    setShowForm(false)
    setSaving(false)
    load()
  }

  async function updateStatus(id: string, status: 'pago' | 'pendente' | 'cancelado') {
    await supabase.from('pronutro_pagamentos').update({ status }).eq('id', id)
    setPagamentos((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)))
  }

  async function deletePagamento(id: string) {
    if (!confirm('Apagar este lançamento financeiro?')) return
    await supabase.from('pronutro_pagamentos').delete().eq('id', id)
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
    if (search && !p.paciente_nome?.toLowerCase().includes(search.toLowerCase())) return false
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
              {patients.filter((p) => p.nome.toLowerCase().includes(search.toLowerCase())).length > 0 && (
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
              {patients.filter((p) => p.nome.toLowerCase().includes(search.toLowerCase())).length === 0 && (
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
