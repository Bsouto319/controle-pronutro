import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsAdmin } from '../hooks/useIsAdmin'
import type { Patient, Medico, Medicamento, Procedimento, Orcamento, OrcamentoItem, OrcamentoStatus } from '../types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import MedicoSelect from '../components/MedicoSelect'

interface OrcamentoComDados extends Orcamento {
  paciente_nome?: string
  itens?: OrcamentoItem[]
}

const STATUS_LABEL: Record<OrcamentoStatus, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aguardando_aprovacao: 'Aguardando aprovação',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
  convertido: 'Convertido em venda',
}

const STATUS_COR: Record<OrcamentoStatus, string> = {
  rascunho: 'bg-gray-100 text-gray-600',
  enviado: 'bg-blue-50 text-blue-700',
  aguardando_aprovacao: 'bg-amber-50 text-amber-700',
  aprovado: 'bg-green-50 text-green-700',
  recusado: 'bg-red-50 text-red-700',
  cancelado: 'bg-red-50 text-red-500',
  convertido: 'bg-purple-50 text-purple-700',
}

const FORMAS = [
  { value: 'pix', label: 'Pix' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_credito', label: 'Cartão crédito' },
  { value: 'cartao_debito', label: 'Cartão débito' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' },
]

function fmtMoney(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function round2(n: number) { return Math.round(n * 100) / 100 }

interface ItemForm {
  tipo: 'medicamento' | 'procedimento' | 'outro'
  medicamento_id: string
  procedimento_id: string
  nome: string
  quantidade: string
  unidade: string
  valor_unitario: string
}

const itemVazio = (): ItemForm => ({ tipo: 'outro', medicamento_id: '', procedimento_id: '', nome: '', quantidade: '1', unidade: 'un', valor_unitario: '' })

export default function OrcamentoPage() {
  const [searchParams] = useSearchParams()
  const { isAdmin, loading: loadingAdmin } = useIsAdmin()
  const [orcamentos, setOrcamentos] = useState<OrcamentoComDados[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [medicos, setMedicos] = useState<Medico[]>([])
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([])
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [convertendo, setConvertendo] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'todos' | OrcamentoStatus>('todos')
  const [patientSearch, setPatientSearch] = useState('')
  const [showPatientDropdown, setShowPatientDropdown] = useState(false)

  const [form, setForm] = useState({
    patient_id: '',
    medico_id: '',
    data: format(new Date(), 'yyyy-MM-dd'),
    validade: '',
    forma_pagamento: 'pix',
    parcelas: '1',
    desconto: '',
    observacoes: '',
  })
  const [itens, setItens] = useState<ItemForm[]>([itemVazio()])

  async function load() {
    setLoading(true)
    const [{ data: orcs }, { data: pts }, { data: docs }, { data: meds }, { data: procs }] = await Promise.all([
      supabase.from('pronutro_orcamentos').select('*, pronutro_orcamento_itens(*)').order('numero', { ascending: false }),
      supabase.from('pronutro_patients').select('*').order('nome'),
      supabase.from('pronutro_medicos').select('*').order('nome'),
      supabase.from('pronutro_medicamentos').select('*').order('nome'),
      supabase.from('pronutro_procedimentos').select('*').order('nome'),
    ])
    const patientsList = pts ?? []
    setPatients(patientsList)
    setMedicos(docs ?? [])
    setMedicamentos(meds ?? [])
    setProcedimentos(procs ?? [])
    setOrcamentos(
      (orcs ?? []).map((o) => ({
        ...o,
        paciente_nome: patientsList.find((p) => p.id === o.patient_id)?.nome ?? '—',
        itens: o.pronutro_orcamento_itens ?? [],
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
    setForm((f) => ({ ...f, patient_id: p.id, medico_id: p.medico_id ?? f.medico_id }))
    setPatientSearch(p.nome)
    setShowForm(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients, searchParams])

  function setItem(i: number, patch: Partial<ItemForm>) {
    setItens((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }

  function addItem() { setItens((prev) => [...prev, itemVazio()]) }
  function removeItem(i: number) { setItens((prev) => prev.filter((_, idx) => idx !== i)) }

  const valorItens = itens.reduce((acc, it) => acc + (Number(it.quantidade.replace(',', '.')) || 0) * (Number(it.valor_unitario.replace(',', '.')) || 0), 0)
  const descontoNum = Number(form.desconto.replace(',', '.')) || 0
  const valorFinal = round2(valorItens - descontoNum)

  async function saveOrcamento() {
    if (!form.patient_id || itens.every((it) => !it.nome.trim())) return
    setSaving(true)
    const { data: orc, error } = await supabase.from('pronutro_orcamentos').insert({
      patient_id: form.patient_id,
      medico_id: form.medico_id || null,
      data: form.data,
      validade: form.validade || null,
      forma_pagamento: form.forma_pagamento,
      parcelas: Number(form.parcelas) || 1,
      desconto: descontoNum,
      observacoes: form.observacoes || null,
      status: 'rascunho',
    }).select().single()

    if (error || !orc) {
      setSaving(false)
      alert('Erro ao salvar orçamento: ' + error?.message)
      return
    }

    const itensParaSalvar = itens
      .filter((it) => it.nome.trim())
      .map((it) => {
        const quantidade = Number(it.quantidade.replace(',', '.')) || 0
        const valorUnitario = Number(it.valor_unitario.replace(',', '.')) || 0
        return {
          orcamento_id: orc.id,
          medicamento_id: it.tipo === 'medicamento' ? it.medicamento_id || null : null,
          procedimento_id: it.tipo === 'procedimento' ? it.procedimento_id || null : null,
          nome: it.nome.trim(),
          quantidade,
          unidade: it.unidade || 'un',
          valor_unitario: valorUnitario,
          valor_total: round2(quantidade * valorUnitario),
        }
      })

    const { error: itensError } = await supabase.from('pronutro_orcamento_itens').insert(itensParaSalvar)
    if (itensError) {
      alert('Orçamento criado, mas houve erro ao salvar os itens: ' + itensError.message)
    }

    setSaving(false)
    setShowForm(false)
    setForm({ patient_id: '', medico_id: '', data: format(new Date(), 'yyyy-MM-dd'), validade: '', forma_pagamento: 'pix', parcelas: '1', desconto: '', observacoes: '' })
    setItens([itemVazio()])
    setPatientSearch('')
    load()
  }

  async function mudarStatus(id: string, status: OrcamentoStatus) {
    await supabase.from('pronutro_orcamentos').update({ status }).eq('id', id)
    load()
  }

  async function deletarOrcamento(id: string) {
    if (!confirm('Apagar este orçamento?')) return
    await supabase.from('pronutro_orcamentos').delete().eq('id', id)
    load()
  }

  // Orçamento aprovado -> venda: cria o lançamento financeiro (1 por
  // orçamento, valor = valor final já com desconto) + entrada de estoque
  // pra cada item que for medicamento (mesmo padrão do savePagamento do
  // Financeiro), sem pedir pra equipe digitar tudo de novo.
  async function converterEmVenda(orc: OrcamentoComDados) {
    if (orc.status !== 'aprovado') return
    if (!confirm(`Converter orçamento #${orc.numero} em lançamento financeiro?`)) return
    setConvertendo(orc.id)

    const itensDoOrcamento = orc.itens ?? []
    const valorTotal = round2(itensDoOrcamento.reduce((acc, it) => acc + Number(it.valor_total), 0) - Number(orc.desconto))
    const itemMedicamento = itensDoOrcamento.find((it) => it.medicamento_id)
    const procedimentoUnico = itensDoOrcamento.length === 1 ? itensDoOrcamento[0].procedimento_id : null

    const { data: pagamento, error } = await supabase.from('pronutro_pagamentos').insert({
      patient_id: orc.patient_id,
      valor: valorTotal,
      data_pagamento: format(new Date(), 'yyyy-MM-dd'),
      data_atendimento: format(new Date(), 'yyyy-MM-dd'),
      forma_pagamento: orc.forma_pagamento ?? 'pix',
      referente_a: 'protocolo',
      procedimento_id: procedimentoUnico,
      status: 'pago',
      medico_id: orc.medico_id,
      medicamento_id: itemMedicamento?.medicamento_id ?? null,
      quantidade_mg: itemMedicamento ? Number(itemMedicamento.quantidade) : null,
      observacoes: `Convertido do orçamento #${orc.numero} (${itensDoOrcamento.map((it) => it.nome).join(', ')})`,
    }).select().single()

    if (error || !pagamento) {
      setConvertendo(null)
      alert('Erro ao gerar lançamento financeiro: ' + error?.message)
      return
    }

    // Entrada de estoque pra cada item de medicamento -- entra no saldo do
    // paciente igual uma compra normal registrada via Financeiro.
    for (const it of itensDoOrcamento) {
      if (!it.medicamento_id) continue
      await supabase.from('pronutro_purchases').insert({
        patient_id: orc.patient_id,
        data_compra: format(new Date(), 'yyyy-MM-dd'),
        quantidade_mg: Number(it.quantidade),
        medicamento_id: it.medicamento_id,
        observacoes: `Convertido do orçamento #${orc.numero}`,
      })
    }

    await supabase.from('pronutro_orcamentos').update({ status: 'convertido', pagamento_id: pagamento.id }).eq('id', orc.id)
    setConvertendo(null)
    load()
  }

  if (loadingAdmin) return <div className="py-12 text-center text-gray-400">Carregando...</div>
  if (!isAdmin) return <Navigate to="/" replace />
  if (loading) return <div className="py-12 text-center text-gray-400">Carregando...</div>

  const filtrados = statusFilter === 'todos' ? orcamentos : orcamentos.filter((o) => o.status === statusFilter)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Orçamentos</h1>
          <p className="text-sm text-gray-400 mt-0.5">Monte, aprove e converta em venda sem digitar o paciente/medicação de novo.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 bg-brand text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-dark transition-colors shadow-sm">
          + Novo Orçamento
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border-2 border-brand p-5 shadow-md space-y-4">
          <h2 className="text-sm font-bold text-gray-700">+ Novo Orçamento</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2 relative">
              <label className="text-xs text-gray-500 block mb-1">Paciente *</label>
              <input type="text" placeholder="Digite pra buscar..." value={patientSearch}
                onChange={(e) => { setPatientSearch(e.target.value); setForm((f) => ({ ...f, patient_id: '' })); setShowPatientDropdown(true) }}
                onFocus={() => setShowPatientDropdown(true)}
                onBlur={() => setTimeout(() => setShowPatientDropdown(false), 150)}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
              {showPatientDropdown && patientSearch && (
                <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                  {patients.filter((p) => p.nome.toLowerCase().includes(patientSearch.toLowerCase())).slice(0, 20).map((p) => (
                    <button key={p.id} type="button"
                      onClick={() => { setForm((f) => ({ ...f, patient_id: p.id, medico_id: p.medico_id ?? f.medico_id })); setPatientSearch(p.nome); setShowPatientDropdown(false) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-brand/10 transition-colors">
                      {p.nome}
                    </button>
                  ))}
                </div>
              )}
              {form.patient_id && (() => {
                const p = patients.find((pt) => pt.id === form.patient_id)
                return p ? <p className="text-xs text-gray-400 mt-1">CPF {p.cpf} · {p.email}</p> : null
              })()}
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Médico</label>
              <MedicoSelect medicos={medicos} medicoId={form.medico_id}
                onChange={(medicoId) => setForm((f) => ({ ...f, medico_id: medicoId }))}
                onCreated={(m) => setMedicos((prev) => [...prev, m])} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Data</label>
              <input type="date" value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Validade</label>
              <input type="date" value={form.validade} onChange={(e) => setForm((f) => ({ ...f, validade: e.target.value }))}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
          </div>

          {/* Itens */}
          <div className="border-t border-gray-100 pt-4">
            <label className="text-xs text-gray-500 block mb-2 font-semibold uppercase tracking-wide">Itens do orçamento</label>
            <div className="space-y-2">
              {itens.map((it, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end bg-gray-50 rounded-lg p-2">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Tipo</label>
                    <select value={it.tipo} onChange={(e) => setItem(i, { tipo: e.target.value as ItemForm['tipo'], medicamento_id: '', procedimento_id: '', nome: '' })}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs">
                      <option value="medicamento">Medicação</option>
                      <option value="procedimento">Procedimento</option>
                      <option value="outro">Outro</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[10px] text-gray-400 block mb-0.5">Item</label>
                    {it.tipo === 'medicamento' ? (
                      <select value={it.medicamento_id} onChange={(e) => {
                        const med = medicamentos.find((m) => m.id === e.target.value)
                        setItem(i, { medicamento_id: e.target.value, nome: med?.nome ?? '', unidade: med?.is_principal ? 'mg' : 'un' })
                      }} className="w-full px-2 py-1 border border-gray-200 rounded text-xs">
                        <option value="">Selecione</option>
                        {medicamentos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                      </select>
                    ) : it.tipo === 'procedimento' ? (
                      <select value={it.procedimento_id} onChange={(e) => {
                        const proc = procedimentos.find((p) => p.id === e.target.value)
                        setItem(i, { procedimento_id: e.target.value, nome: proc?.nome ?? '', valor_unitario: proc?.valor_padrao != null ? String(proc.valor_padrao) : it.valor_unitario })
                      }} className="w-full px-2 py-1 border border-gray-200 rounded text-xs">
                        <option value="">Selecione</option>
                        {procedimentos.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    ) : (
                      <input type="text" placeholder="Nome do item" value={it.nome} onChange={(e) => setItem(i, { nome: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-200 rounded text-xs" />
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Qtd ({it.unidade})</label>
                    <input type="text" value={it.quantidade} onChange={(e) => setItem(i, { quantidade: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Valor unit. (R$)</label>
                    <input type="text" value={it.valor_unitario} onChange={(e) => setItem(i, { valor_unitario: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs" />
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-gray-600">
                      {fmtMoney((Number(it.quantidade.replace(',', '.')) || 0) * (Number(it.valor_unitario.replace(',', '.')) || 0))}
                    </span>
                    {itens.length > 1 && (
                      <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={addItem} className="mt-2 text-xs font-medium text-brand hover:underline">+ Adicionar item</button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-gray-100 pt-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Forma de pagamento</label>
              <select value={form.forma_pagamento} onChange={(e) => setForm((f) => ({ ...f, forma_pagamento: e.target.value }))}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand">
                {FORMAS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Nº de parcelas</label>
              <input type="number" min="1" value={form.parcelas} onChange={(e) => setForm((f) => ({ ...f, parcelas: e.target.value }))}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Desconto (R$)</label>
              <input type="text" placeholder="0" value={form.desconto} onChange={(e) => setForm((f) => ({ ...f, desconto: e.target.value }))}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <div className="bg-brand/5 rounded-lg p-2 flex flex-col justify-center">
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">Valor final</span>
              <span className="text-lg font-bold text-brand">{fmtMoney(valorFinal)}</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Observações</label>
            <input type="text" placeholder="Opcional" value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <div className="flex gap-2">
            <button onClick={saveOrcamento} disabled={saving || !form.patient_id}
              className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar Orçamento'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Filtro por status */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setStatusFilter('todos')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium ${statusFilter === 'todos' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>
          Todos ({orcamentos.length})
        </button>
        {(Object.keys(STATUS_LABEL) as OrcamentoStatus[]).map((s) => {
          const count = orcamentos.filter((o) => o.status === s).length
          if (count === 0) return null
          return (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${statusFilter === s ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>
              {STATUS_LABEL[s]} ({count})
            </button>
          )
        })}
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {filtrados.length === 0 && (
          <p className="text-sm text-gray-400 bg-white rounded-2xl border border-gray-200 p-5">Nenhum orçamento nesse filtro.</p>
        )}
        {filtrados.map((o) => {
          const totalItens = (o.itens ?? []).reduce((acc, it) => acc + Number(it.valor_total), 0)
          const valorFinalOrc = round2(totalItens - Number(o.desconto))
          return (
            <div key={o.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-800">#{o.numero}</span>
                    <span className="text-gray-700">{o.paciente_nome}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COR[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {format(new Date(o.data + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                    {o.validade && ` · válido até ${format(new Date(o.validade + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}`}
                    {o.medico_id && ` · ${medicos.find((m) => m.id === o.medico_id)?.nome ?? ''}`}
                  </p>
                </div>
                <span className="text-lg font-bold text-brand">{fmtMoney(valorFinalOrc)}</span>
              </div>

              <div className="text-sm text-gray-600 space-y-0.5 mb-3">
                {(o.itens ?? []).map((it) => (
                  <div key={it.id} className="flex justify-between">
                    <span>{it.nome} — {it.quantidade} {it.unidade}</span>
                    <span>{fmtMoney(Number(it.valor_total))}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                {o.status === 'rascunho' && <button onClick={() => mudarStatus(o.id, 'enviado')} className="text-xs px-2.5 py-1 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50">Marcar Enviado</button>}
                {o.status === 'enviado' && <button onClick={() => mudarStatus(o.id, 'aguardando_aprovacao')} className="text-xs px-2.5 py-1 rounded-lg border border-amber-200 text-amber-600 hover:bg-amber-50">Aguardando Aprovação</button>}
                {(o.status === 'enviado' || o.status === 'aguardando_aprovacao') && (
                  <>
                    <button onClick={() => mudarStatus(o.id, 'aprovado')} className="text-xs px-2.5 py-1 rounded-lg border border-green-200 text-green-700 hover:bg-green-50">✓ Aprovar</button>
                    <button onClick={() => mudarStatus(o.id, 'recusado')} className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">Recusar</button>
                  </>
                )}
                {o.status === 'aprovado' && (
                  <button onClick={() => converterEmVenda(o)} disabled={convertendo === o.id}
                    className="text-xs px-2.5 py-1 rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-50">
                    {convertendo === o.id ? 'Convertendo...' : '→ Converter em Venda'}
                  </button>
                )}
                {o.status === 'convertido' && <span className="text-xs text-purple-600">✓ Já virou lançamento financeiro</span>}
                {!['convertido', 'cancelado'].includes(o.status) && (
                  <button onClick={() => mudarStatus(o.id, 'cancelado')} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">Cancelar</button>
                )}
                <button onClick={() => deletarOrcamento(o.id)} className="text-xs px-2.5 py-1 rounded-lg text-red-400 hover:text-red-600 ml-auto">Apagar</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
