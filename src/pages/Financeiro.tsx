import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsAdmin } from '../hooks/useIsAdmin'
import type { Pagamento, Patient, Medicamento, Medico, Procedimento, Meta } from '../types'
import { format, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import ImportPagamentosCSVModal from '../components/ImportPagamentosCSVModal'
import MedicoSelect from '../components/MedicoSelect'
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

const CATEGORIAS_PROCEDIMENTO = [
  { value: 'consulta', label: 'Consulta' },
  { value: 'procedimento', label: 'Procedimento' },
  { value: 'tratamento', label: 'Tratamento' },
  { value: 'aplicacao', label: 'Aplicação' },
  { value: 'produto', label: 'Produto' },
  { value: 'outro', label: 'Outro' },
]

const BANDEIRAS = ['Visa', 'Mastercard', 'Elo', 'Amex', 'Hipercard', 'Outra']

const STATUS_RECEBIMENTO = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'a_receber', label: 'A receber' },
  { value: 'recebido', label: 'Recebido' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'estornado', label: 'Estornado' },
  { value: 'divergente', label: 'Divergente' },
]

const usaCartao = (forma: string) => forma === 'cartao_credito' || forma === 'cartao_debito'

function fmtMoney(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Financeiro() {
  const [searchParams] = useSearchParams()
  const { isAdmin, loading: loadingAdmin } = useIsAdmin()
  const [pagamentos, setPagamentos] = useState<PagamentoComPaciente[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([])
  const [medicos, setMedicos] = useState<Medico[]>([])
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([])
  const [metas, setMetas] = useState<Meta[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showEstoqueMed, setShowEstoqueMed] = useState(false)
  const [showMedicos, setShowMedicos] = useState(false)
  const [showProcedimentos, setShowProcedimentos] = useState(false)
  const [showMetas, setShowMetas] = useState(false)
  const [novoMedicoNome, setNovoMedicoNome] = useState('')
  const [novoMedicoRepasse, setNovoMedicoRepasse] = useState('')
  const [savingMedico, setSavingMedico] = useState(false)
  const [editandoRepasse, setEditandoRepasse] = useState<Record<string, string>>({})
  const [novoProcNome, setNovoProcNome] = useState('')
  const [novoProcCategoria, setNovoProcCategoria] = useState('procedimento')
  const [novoProcValor, setNovoProcValor] = useState('')
  const [savingProc, setSavingProc] = useState(false)
  const [novaMetaMes, setNovaMetaMes] = useState(format(new Date(), 'yyyy-MM'))
  const [novaMetaMedico, setNovaMetaMedico] = useState('')
  const [novaMetaValor, setNovaMetaValor] = useState('')
  const [savingMeta, setSavingMeta] = useState(false)
  const [showDetalhesFinanceiros, setShowDetalhesFinanceiros] = useState(false)
  const [novoMedNome, setNovoMedNome] = useState('')
  const [novoMedEstoque, setNovoMedEstoque] = useState('')
  const [novoMedCusto, setNovoMedCusto] = useState('')
  const [savingMed, setSavingMed] = useState(false)
  const [ajusteEstoque, setAjusteEstoque] = useState<Record<string, string>>({})
  const [editandoCusto, setEditandoCusto] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pago' | 'pendente' | 'cancelado'>('todos')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [patientSearch, setPatientSearch] = useState('')
  const [showPatientDropdown, setShowPatientDropdown] = useState(false)
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)

  const formInicial = {
    patient_id: '',
    valor: '',
    data_pagamento: format(new Date(), 'yyyy-MM-dd'),
    data_atendimento: format(new Date(), 'yyyy-MM-dd'),
    forma_pagamento: 'pix',
    referente_a: 'consulta',
    procedimento_id: '',
    status: 'pago' as 'pago' | 'pendente' | 'cancelado',
    observacoes: '',
    medicamento_id: '',
    quantidade_mg: '',
    medico_id: '',
    bandeira: '',
    banco_operadora: '',
    taxa_cartao: '',
    data_deposito: '',
    status_recebimento: '',
    indicacao: '',
    nf_numero: '',
    nf_valor: '',
    imposto: '',
    custo_clinica: '',
  }
  const [form, setForm] = useState(formInicial)

  async function load() {
    setLoading(true)
    const [{ data: pags }, { data: pts }, { data: meds }, { data: docs }, { data: procs }, { data: mts }] = await Promise.all([
      supabase.from('pronutro_pagamentos').select('*').order('data_pagamento', { ascending: false }),
      supabase.from('pronutro_patients').select('*').order('nome'),
      supabase.from('pronutro_medicamentos').select('*').order('nome'),
      supabase.from('pronutro_medicos').select('*').order('nome'),
      supabase.from('pronutro_procedimentos').select('*').order('nome'),
      supabase.from('pronutro_metas').select('*').order('mes', { ascending: false }),
    ])
    const patientsList = pts ?? []
    setPatients(patientsList)
    setMedicamentos(meds ?? [])
    setMedicos(docs ?? [])
    setProcedimentos(procs ?? [])
    setMetas(mts ?? [])
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
    setForm((f) => ({ ...f, patient_id: p.id, medico_id: p.medico_id ?? f.medico_id }))
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
    const valorNum = Number(form.valor.replace(',', '.'))
    const taxaCartaoNum = form.taxa_cartao ? Number(form.taxa_cartao.replace(',', '.')) : null
    const valorLiquido = taxaCartaoNum != null ? round2(valorNum - taxaCartaoNum) : null

    const { error } = await supabase.from('pronutro_pagamentos').insert({
      patient_id: form.patient_id,
      valor: valorNum,
      data_pagamento: form.data_pagamento,
      data_atendimento: form.data_atendimento || form.data_pagamento,
      forma_pagamento: form.forma_pagamento,
      referente_a: form.referente_a,
      procedimento_id: form.procedimento_id || null,
      status: form.status,
      observacoes: form.observacoes || null,
      medicamento_id: form.medicamento_id || null,
      quantidade_mg: quantidadeMg,
      medico_id: form.medico_id || null,
      bandeira: form.bandeira || null,
      banco_operadora: form.banco_operadora || null,
      taxa_cartao: taxaCartaoNum,
      valor_liquido: valorLiquido,
      data_deposito: form.data_deposito || null,
      status_recebimento: form.status_recebimento || null,
      indicacao: form.indicacao || null,
      nf_numero: form.nf_numero || null,
      nf_valor: form.nf_valor ? Number(form.nf_valor.replace(',', '.')) : null,
      imposto: form.imposto ? Number(form.imposto.replace(',', '.')) : null,
      custo_clinica: form.custo_clinica ? Number(form.custo_clinica.replace(',', '.')) : null,
    })
    if (error) {
      setSaving(false)
      alert('Erro ao salvar pagamento: ' + error.message)
      console.error('savePagamento', error)
      return
    }

    // Pagamento referente a medicação: entra no estoque do paciente (comprado).
    // NÃO desconta o estoque geral aqui — isso só acontece quando a dose é
    // de fato aplicada (ver saveDose em Paciente.tsx), pra não descontar 2x
    // nem descontar antes do paciente vir de verdade tomar a dose.
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
    }

    setSaving(false)
    setForm(formInicial)
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
      custo_mg: novoMedCusto ? Number(novoMedCusto.replace(',', '.')) : null,
    })
    setSavingMed(false)
    if (error) {
      alert('Erro ao cadastrar medicação: ' + error.message)
      return
    }
    setNovoMedNome('')
    setNovoMedEstoque('')
    setNovoMedCusto('')
    load()
  }

  async function salvarCusto(medId: string) {
    const valor = editandoCusto[medId]
    if (valor === undefined) return
    const custo = valor.trim() === '' ? null : Number(valor.replace(',', '.'))
    const { error } = await supabase.from('pronutro_medicamentos').update({ custo_mg: custo }).eq('id', medId)
    if (error) {
      alert('Erro ao salvar custo: ' + error.message)
      return
    }
    setEditandoCusto((c) => { const next = { ...c }; delete next[medId]; return next })
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

  async function saveMedico() {
    if (!novoMedicoNome.trim()) return
    setSavingMedico(true)
    const { error } = await supabase.from('pronutro_medicos').insert({
      nome: novoMedicoNome.trim(),
      percentual_repasse: novoMedicoRepasse ? Number(novoMedicoRepasse.replace(',', '.')) : null,
    })
    setSavingMedico(false)
    if (error) {
      alert('Erro ao cadastrar médico: ' + error.message)
      return
    }
    setNovoMedicoNome('')
    setNovoMedicoRepasse('')
    load()
  }

  async function salvarRepasse(medId: string) {
    const valor = editandoRepasse[medId]
    if (valor === undefined) return
    const pct = valor.trim() === '' ? null : Number(valor.replace(',', '.'))
    const { error } = await supabase.from('pronutro_medicos').update({ percentual_repasse: pct }).eq('id', medId)
    if (error) {
      alert('Erro ao salvar percentual de repasse: ' + error.message)
      return
    }
    setEditandoRepasse((c) => { const next = { ...c }; delete next[medId]; return next })
    load()
  }

  async function saveProcedimento() {
    if (!novoProcNome.trim()) return
    setSavingProc(true)
    const { error } = await supabase.from('pronutro_procedimentos').insert({
      nome: novoProcNome.trim(),
      categoria: novoProcCategoria,
      valor_padrao: novoProcValor ? Number(novoProcValor.replace(',', '.')) : null,
    })
    setSavingProc(false)
    if (error) {
      alert('Erro ao cadastrar procedimento: ' + error.message)
      return
    }
    setNovoProcNome('')
    setNovoProcValor('')
    load()
  }

  async function saveMeta() {
    if (!novaMetaMes || !novaMetaValor) return
    setSavingMeta(true)
    const { error } = await supabase.from('pronutro_metas').upsert({
      mes: novaMetaMes,
      medico_id: novaMetaMedico || null,
      procedimento_id: null,
      valor_meta: Number(novaMetaValor.replace(',', '.')),
    }, { onConflict: 'mes,medico_id,procedimento_id' })
    setSavingMeta(false)
    if (error) {
      alert('Erro ao salvar meta: ' + error.message)
      return
    }
    setNovaMetaValor('')
    load()
  }

  async function deletarMeta(id: string) {
    if (!confirm('Remover esta meta?')) return
    await supabase.from('pronutro_metas').delete().eq('id', id)
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

  const pagos = pagamentos.filter((p) => p.status === 'pago')

  const receitaMensal = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(new Date(), 5 - i)
    const chave = format(d, 'yyyy-MM')
    const total = pagos
      .filter((p) => p.data_pagamento.startsWith(chave))
      .reduce((acc, p) => acc + Number(p.valor), 0)
    return { mes: format(d, 'MMM/yy', { locale: ptBR }), receita: Math.round(total * 100) / 100 }
  })

  const faturamentoPorMedico = medicos
    .map((m) => {
      const pagosDoMedico = pagos.filter((p) => p.medico_id === m.id)
      const atendimentos = pagosDoMedico.length
      const faturamento = pagosDoMedico.reduce((acc, p) => acc + Number(p.valor), 0)
      const repasse = m.percentual_repasse != null ? round2(faturamento * (m.percentual_repasse / 100)) : null
      const resultado = repasse != null ? round2(faturamento - repasse) : null
      return { nome: m.nome, atendimentos, faturamento, repasse, resultado }
    })
    .filter((m) => m.atendimentos > 0)
    .sort((a, b) => b.faturamento - a.faturamento)

  function round2(n: number) { return Math.round(n * 100) / 100 }

  const margemPorMedicacao = medicamentos
    .map((m) => {
      const pagosDaMed = pagos.filter((p) => p.medicamento_id === m.id)
      const receita = pagosDaMed.reduce((acc, p) => acc + Number(p.valor), 0)
      const mgVendido = pagosDaMed.reduce((acc, p) => acc + Number(p.quantidade_mg ?? 0), 0)
      const custo = m.custo_mg != null ? mgVendido * m.custo_mg : null
      const margem = custo != null ? receita - custo : null
      const margemPct = margem != null && receita > 0 ? (margem / receita) * 100 : null
      return { nome: m.nome, receita, mgVendido, custo, margem, margemPct }
    })
    .filter((m) => m.receita > 0 || m.mgVendido > 0)
    .sort((a, b) => b.receita - a.receita)

  const mesAtualChave = format(new Date(), 'yyyy-MM')
  const pagosMesAtual = pagos.filter((p) => p.data_pagamento.startsWith(mesAtualChave))
  const metasDoMes = metas.filter((m) => m.mes === mesAtualChave)
  const metaGeral = metasDoMes.find((m) => !m.medico_id)
  const metaGeralRealizado = round2(pagosMesAtual.reduce((acc, p) => acc + Number(p.valor), 0))
  const metasPorMedico = metasDoMes
    .filter((m) => m.medico_id)
    .map((m) => {
      const medico = medicos.find((med) => med.id === m.medico_id)
      const realizado = round2(pagosMesAtual.filter((p) => p.medico_id === m.medico_id).reduce((acc, p) => acc + Number(p.valor), 0))
      const pct = m.valor_meta > 0 ? round2((realizado / m.valor_meta) * 100) : 0
      return { id: m.id, nome: medico?.nome ?? '—', meta: m.valor_meta, realizado, diferenca: round2(realizado - m.valor_meta), pct }
    })

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
          <button onClick={() => setShowMedicos((v) => !v)} className="flex items-center gap-1.5 border border-gray-200 text-gray-600 px-3 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors font-medium bg-white">
            👨‍⚕️ <span className="hidden sm:inline">Médicos e</span> Repasse
          </button>
          <button onClick={() => setShowProcedimentos((v) => !v)} className="flex items-center gap-1.5 border border-gray-200 text-gray-600 px-3 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors font-medium bg-white">
            📋 Procedimentos
          </button>
          <button onClick={() => setShowMetas((v) => !v)} className="flex items-center gap-1.5 border border-gray-200 text-gray-600 px-3 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors font-medium bg-white">
            🎯 Metas
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
                    <span className="text-gray-400 mx-1.5">·</span>
                    <span className="text-gray-500">{m.custo_mg != null ? `custo ${fmtMoney(m.custo_mg)}/mg` : 'sem custo definido'}</span>
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
                    <input
                      type="text"
                      placeholder="custo R$/mg"
                      value={editandoCusto[m.id] ?? (m.custo_mg != null ? String(m.custo_mg) : '')}
                      onChange={(e) => setEditandoCusto((c) => ({ ...c, [m.id]: e.target.value }))}
                      className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                    <button onClick={() => salvarCusto(m.id)} className="text-xs font-medium text-brand hover:underline">
                      Salvar custo
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
            <div>
              <label className="text-xs text-gray-500 block mb-1">Custo (R$/mg)</label>
              <input type="text" placeholder="Opcional" value={novoMedCusto}
                onChange={(e) => setNovoMedCusto(e.target.value)}
                className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <button onClick={saveMedicamento} disabled={savingMed || !novoMedNome.trim()}
              className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
              {savingMed ? 'Salvando...' : '+ Cadastrar'}
            </button>
          </div>
        </div>
      )}

      {showMedicos && (
        <div className="bg-white rounded-2xl border-2 border-blue-300 p-5 shadow-md space-y-4">
          <h2 className="text-sm font-bold text-gray-700">👨‍⚕️ Médicos e Percentual de Repasse</h2>
          {medicos.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum médico cadastrado ainda.</p>
          ) : (
            <div className="space-y-2">
              {medicos.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2 text-sm">
                  <div>
                    <span className="font-semibold text-gray-800">{m.nome}</span>
                    <span className="text-gray-400 mx-1.5">·</span>
                    <span className="text-gray-500">{m.percentual_repasse != null ? `${m.percentual_repasse}% de repasse` : 'sem % definido'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="% repasse"
                      value={editandoRepasse[m.id] ?? (m.percentual_repasse != null ? String(m.percentual_repasse) : '')}
                      onChange={(e) => setEditandoRepasse((c) => ({ ...c, [m.id]: e.target.value }))}
                      className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                    <button onClick={() => salvarRepasse(m.id)} className="text-xs font-medium text-brand hover:underline">
                      Salvar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-gray-100 pt-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Novo médico</label>
              <input type="text" placeholder="Ex: Dr. João" value={novoMedicoNome}
                onChange={(e) => setNovoMedicoNome(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">% de repasse</label>
              <input type="text" placeholder="Opcional" value={novoMedicoRepasse}
                onChange={(e) => setNovoMedicoRepasse(e.target.value)}
                className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <button onClick={saveMedico} disabled={savingMedico || !novoMedicoNome.trim()}
              className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
              {savingMedico ? 'Salvando...' : '+ Cadastrar'}
            </button>
          </div>
        </div>
      )}

      {showProcedimentos && (
        <div className="bg-white rounded-2xl border-2 border-blue-300 p-5 shadow-md space-y-4">
          <h2 className="text-sm font-bold text-gray-700">📋 Procedimentos</h2>
          {procedimentos.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum procedimento cadastrado ainda.</p>
          ) : (
            <div className="space-y-2">
              {procedimentos.map((proc) => (
                <div key={proc.id} className="flex flex-wrap items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2 text-sm">
                  <div>
                    <span className="font-semibold text-gray-800">{proc.nome}</span>
                    <span className="text-gray-400 mx-1.5">·</span>
                    <span className="text-gray-500">{CATEGORIAS_PROCEDIMENTO.find((c) => c.value === proc.categoria)?.label ?? proc.categoria}</span>
                    <span className="text-gray-400 mx-1.5">·</span>
                    <span className="text-gray-500">{proc.valor_padrao != null ? fmtMoney(proc.valor_padrao) : 'sem valor padrão'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-gray-100 pt-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Novo procedimento</label>
              <input type="text" placeholder="Ex: Consulta inicial" value={novoProcNome}
                onChange={(e) => setNovoProcNome(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Categoria</label>
              <select value={novoProcCategoria} onChange={(e) => setNovoProcCategoria(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand">
                {CATEGORIAS_PROCEDIMENTO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Valor padrão (R$)</label>
              <input type="text" placeholder="Opcional" value={novoProcValor}
                onChange={(e) => setNovoProcValor(e.target.value)}
                className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <button onClick={saveProcedimento} disabled={savingProc || !novoProcNome.trim()}
              className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
              {savingProc ? 'Salvando...' : '+ Cadastrar'}
            </button>
          </div>
        </div>
      )}

      {showMetas && (
        <div className="bg-white rounded-2xl border-2 border-blue-300 p-5 shadow-md space-y-4">
          <h2 className="text-sm font-bold text-gray-700">🎯 Metas mensais</h2>
          {metas.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma meta cadastrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {metas.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2 text-sm">
                  <div>
                    <span className="font-semibold text-gray-800">{m.mes}</span>
                    <span className="text-gray-400 mx-1.5">·</span>
                    <span className="text-gray-600">{m.medico_id ? (medicos.find((med) => med.id === m.medico_id)?.nome ?? 'médico') : 'Clínica (geral)'}</span>
                    <span className="text-gray-400 mx-1.5">·</span>
                    <span className="text-gray-500">{fmtMoney(m.valor_meta)}</span>
                  </div>
                  <button onClick={() => deletarMeta(m.id)} className="text-xs text-red-400 hover:text-red-600">Remover</button>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-gray-100 pt-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Mês</label>
              <input type="month" value={novaMetaMes} onChange={(e) => setNovaMetaMes(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Médico (vazio = meta da clínica)</label>
              <select value={novaMetaMedico} onChange={(e) => setNovaMetaMedico(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand">
                <option value="">Clínica (geral)</option>
                {medicos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Valor da meta (R$)</label>
              <input type="text" placeholder="Ex: 50000" value={novaMetaValor}
                onChange={(e) => setNovaMetaValor(e.target.value)}
                className="w-32 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <button onClick={saveMeta} disabled={savingMeta || !novaMetaValor}
              className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
              {savingMeta ? 'Salvando...' : '+ Salvar meta'}
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

      {/* Meta x Realizado do mês atual */}
      {(metaGeral || metasPorMedico.length > 0) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-bold text-gray-800 mb-3">🎯 Meta x Realizado — {format(new Date(), 'MMMM/yyyy', { locale: ptBR })}</h2>
          <div className="space-y-3">
            {metaGeral && (() => {
              const pct = metaGeral.valor_meta > 0 ? round2((metaGeralRealizado / metaGeral.valor_meta) * 100) : 0
              return (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">Clínica (geral)</span>
                    <span className="text-gray-500">{fmtMoney(metaGeralRealizado)} / {fmtMoney(metaGeral.valor_meta)} · {pct}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className={`h-2 rounded-full ${pct >= 100 ? 'bg-green-500' : 'bg-brand'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              )
            })()}
            {metasPorMedico.map((m) => (
              <div key={m.id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700">{m.nome}</span>
                  <span className="text-gray-500">{fmtMoney(m.realizado)} / {fmtMoney(m.meta)} · {m.pct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className={`h-2 rounded-full ${m.pct >= 100 ? 'bg-green-500' : 'bg-brand'}`} style={{ width: `${Math.min(m.pct, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Visão geral: tendência de receita + margem por medicação */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-6">
        <div>
          <h2 className="font-bold text-gray-800 mb-1">Receita mensal (pago)</h2>
          <p className="text-xs text-gray-400 mb-3">Últimos 6 meses, independente dos filtros acima.</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={receitaMensal} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip formatter={(v) => fmtMoney(Number(v))} />
              <Bar dataKey="receita" fill="#1a6b3c" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {faturamentoPorMedico.length > 0 && (
          <div>
            <h2 className="font-bold text-gray-800 mb-1">Faturamento por médico</h2>
            <p className="text-xs text-gray-400 mb-3">Repasse calculado só pros médicos com % cadastrado (aba Médicos e Repasse).</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs border-b border-gray-100">
                    <th className="py-2 pr-4 font-medium">Médico</th>
                    <th className="py-2 pr-4 font-medium">Atendimentos</th>
                    <th className="py-2 pr-4 font-medium">Faturamento</th>
                    <th className="py-2 pr-4 font-medium">Repasse</th>
                    <th className="py-2 pr-4 font-medium">Resultado clínica</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {faturamentoPorMedico.map((m) => (
                    <tr key={m.nome}>
                      <td className="py-2 pr-4 font-medium text-gray-800">{m.nome}</td>
                      <td className="py-2 pr-4 text-gray-600">{m.atendimentos}</td>
                      <td className="py-2 pr-4 text-gray-700">{fmtMoney(m.faturamento)}</td>
                      <td className="py-2 pr-4 text-gray-500">{m.repasse != null ? fmtMoney(m.repasse) : '—'}</td>
                      <td className="py-2 pr-4 font-semibold">
                        {m.resultado != null ? <span className="text-green-700">{fmtMoney(m.resultado)}</span> : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {margemPorMedicacao.length > 0 && (
          <div>
            <h2 className="font-bold text-gray-800 mb-1">Margem por medicação</h2>
            <p className="text-xs text-gray-400 mb-3">Custo calculado só pras medicações com custo/mg cadastrado (aba Estoque Medicações).</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs border-b border-gray-100">
                    <th className="py-2 pr-4 font-medium">Medicação</th>
                    <th className="py-2 pr-4 font-medium">Mg vendido</th>
                    <th className="py-2 pr-4 font-medium">Receita</th>
                    <th className="py-2 pr-4 font-medium">Custo</th>
                    <th className="py-2 pr-4 font-medium">Margem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {margemPorMedicacao.map((m) => (
                    <tr key={m.nome}>
                      <td className="py-2 pr-4 font-medium text-gray-800">{m.nome}</td>
                      <td className="py-2 pr-4 text-gray-600">{m.mgVendido} mg</td>
                      <td className="py-2 pr-4 text-gray-700">{fmtMoney(m.receita)}</td>
                      <td className="py-2 pr-4 text-gray-500">{m.custo != null ? fmtMoney(m.custo) : '—'}</td>
                      <td className="py-2 pr-4 font-semibold">
                        {m.margem != null ? (
                          <span className={m.margem >= 0 ? 'text-green-700' : 'text-red-600'}>
                            {fmtMoney(m.margem)} {m.margemPct != null && `(${m.margemPct.toFixed(0)}%)`}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
                        onClick={() => { setForm((f) => ({ ...f, patient_id: p.id, medico_id: p.medico_id ?? f.medico_id })); setPatientSearch(p.nome); setShowPatientDropdown(false) }}
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
              <label className="text-xs text-gray-500 block mb-1">Médico (opcional)</label>
              <MedicoSelect
                medicos={medicos}
                medicoId={form.medico_id}
                onChange={(medicoId) => setForm((f) => ({ ...f, medico_id: medicoId }))}
                onCreated={(m) => setMedicos((prev) => [...prev, m])}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Referente a</label>
              <select value={form.referente_a} onChange={(e) => setForm((f) => ({ ...f, referente_a: e.target.value }))}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand">
                {REFERENTES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Procedimento (opcional)</label>
              <select value={form.procedimento_id} onChange={(e) => {
                const procId = e.target.value
                const proc = procedimentos.find((p) => p.id === procId)
                setForm((f) => ({ ...f, procedimento_id: procId, valor: !f.valor && proc?.valor_padrao != null ? String(proc.valor_padrao) : f.valor }))
              }}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand">
                <option value="">Nenhum</option>
                {procedimentos.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
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
                <p className="text-[11px] text-gray-400 mt-1">Entra no estoque do paciente. O estoque geral só desconta quando a dose for aplicada.</p>
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

          <button type="button" onClick={() => setShowDetalhesFinanceiros((v) => !v)}
            className="text-xs font-medium text-brand hover:underline">
            {showDetalhesFinanceiros ? '− Ocultar' : '+ Mostrar'} detalhes financeiros (cartão/Stone, NF, imposto, meta)
          </button>

          {showDetalhesFinanceiros && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-gray-100 pt-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Data do atendimento</label>
                <input type="date" value={form.data_atendimento}
                  onChange={(e) => setForm((f) => ({ ...f, data_atendimento: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Indicação (quem indicou)</label>
                <input type="text" placeholder="Opcional" value={form.indicacao}
                  onChange={(e) => setForm((f) => ({ ...f, indicacao: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
              {usaCartao(form.forma_pagamento) && (
                <>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Bandeira</label>
                    <select value={form.bandeira} onChange={(e) => setForm((f) => ({ ...f, bandeira: e.target.value }))}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand">
                      <option value="">Selecione</option>
                      {BANDEIRAS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Banco/Operadora</label>
                    <input type="text" placeholder="Ex: Stone, Cielo..." value={form.banco_operadora}
                      onChange={(e) => setForm((f) => ({ ...f, banco_operadora: e.target.value }))}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Taxa cartão (R$)</label>
                    <input type="text" placeholder="Ex: 8,90" value={form.taxa_cartao}
                      onChange={(e) => setForm((f) => ({ ...f, taxa_cartao: e.target.value }))}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
                    {form.valor && form.taxa_cartao && (
                      <p className="text-[11px] text-gray-400 mt-1">
                        Líquido: {fmtMoney(round2(Number(form.valor.replace(',', '.')) - Number(form.taxa_cartao.replace(',', '.'))))}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Data do depósito</label>
                    <input type="date" value={form.data_deposito}
                      onChange={(e) => setForm((f) => ({ ...f, data_deposito: e.target.value }))}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Status do recebimento</label>
                    <select value={form.status_recebimento} onChange={(e) => setForm((f) => ({ ...f, status_recebimento: e.target.value }))}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand">
                      <option value="">Selecione</option>
                      {STATUS_RECEBIMENTO.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div>
                <label className="text-xs text-gray-500 block mb-1">NF nº</label>
                <input type="text" placeholder="Opcional" value={form.nf_numero}
                  onChange={(e) => setForm((f) => ({ ...f, nf_numero: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">NF valor (R$)</label>
                <input type="text" placeholder="Opcional" value={form.nf_valor}
                  onChange={(e) => setForm((f) => ({ ...f, nf_valor: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Imposto (R$)</label>
                <input type="text" placeholder="Opcional" value={form.imposto}
                  onChange={(e) => setForm((f) => ({ ...f, imposto: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Custo clínica manual (R$)</label>
                <input type="text" placeholder="Opcional" value={form.custo_clinica}
                  onChange={(e) => setForm((f) => ({ ...f, custo_clinica: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
            </div>
          )}

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
                        setForm((f) => ({ ...f, patient_id: p.id, medico_id: p.medico_id ?? f.medico_id }))
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
