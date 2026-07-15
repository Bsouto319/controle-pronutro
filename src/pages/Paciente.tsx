import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SignaturePad, { type SignaturePadHandle } from '../components/SignaturePad'
import EvolucaoChart from '../components/EvolucaoChart'
import { useIsAdmin } from '../hooks/useIsAdmin'
import type { Patient, Contract, DoseRecord, Purchase, EvolucaoRecord, Bioimpedancia } from '../types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const statusBadge = (status?: string) => {
  if (!status || status === 'pending')
    return <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">Aguardando assinatura</span>
  if (status === 'signed')
    return <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">✓ Assinado</span>
  return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">Expirado</span>
}

export default function Paciente() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin } = useIsAdmin()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [contract, setContract] = useState<Contract | null>(null)
  const [doses, setDoses] = useState<DoseRecord[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<number | null>(null)
  const [savingPurchase, setSavingPurchase] = useState(false)
  const [togglingStatus, setTogglingStatus] = useState(false)
  const [finalizando, setFinalizando] = useState(false)
  const [doseForm, setDoseForm] = useState<Record<number, Partial<DoseRecord>>>({})
  const [evolucao, setEvolucao] = useState<EvolucaoRecord[]>([])
  const [evolucaoForm, setEvolucaoForm] = useState<Record<number, { peso_kg: string; gordura_pct: string }>>({})
  const [activeSig, setActiveSig] = useState<number | null>(null)
  const [purchaseForm, setPurchaseForm] = useState({ data_compra: '', quantidade_mg: '', lote: '', observacoes: '' })
  const [purchaseReceitaFile, setPurchaseReceitaFile] = useState<File | null>(null)
  const [numSemanas, setNumSemanas] = useState(8)
  const [uploadingPdf, setUploadingPdf] = useState<number | null>(null)
  const [expandedWeeks, setExpandedWeeks] = useState<Record<number, boolean>>({})
  const [expandedCiclos, setExpandedCiclos] = useState<Record<number, boolean>>({})
  const [showPatientInfo, setShowPatientInfo] = useState(false)
  const [bioimpedancias, setBioimpedancias] = useState<Bioimpedancia[]>([])
  const [bioForm, setBioForm] = useState({ data_exame: '', observacoes: '' })
  const [bioFile, setBioFile] = useState<File | null>(null)
  const [savingBio, setSavingBio] = useState(false)
  const [analisandoBio, setAnalisandoBio] = useState<Record<string, boolean>>({})

  // Edição de dados do paciente
  const [editingPatient, setEditingPatient] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Patient>>({})
  const [savingEdit, setSavingEdit] = useState(false)

  const sigRefs = useRef<Record<number, SignaturePadHandle | null>>({})
  const purchaseReceitaInputRef = useRef<HTMLInputElement>(null)
  const bioFileInputRef = useRef<HTMLInputElement>(null)

  async function loadData() {
    const [{ data: p }, { data: c }, { data: d }, { data: pur }, { data: ev }, { data: bio }] = await Promise.all([
      supabase.from('pronutro_patients').select('*').eq('id', id).single(),
      supabase.from('pronutro_contracts').select('*').eq('patient_id', id).single(),
      supabase.from('pronutro_dose_records').select('*').eq('patient_id', id).order('semana'),
      supabase.from('pronutro_purchases').select('*').eq('patient_id', id).order('data_compra'),
      supabase.from('pronutro_evolucao').select('*').eq('patient_id', id).order('semana'),
      supabase.from('pronutro_bioimpedancia').select('*').eq('patient_id', id).order('data_exame', { ascending: false }),
    ])
    setPatient(p)
    setContract(c)
    setDoses(d ?? [])
    setPurchases(pur ?? [])
    setEvolucao(ev ?? [])
    setBioimpedancias(bio ?? [])

    // Só a semana/formulário do ciclo em andamento — ciclos anteriores ficam só no histórico
    const cicloAtual = p?.ciclo_atual ?? 1
    const doseAtual = ((d as DoseRecord[]) ?? []).filter(r => r.ciclo === cicloAtual)
    const evoAtual = ((ev as EvolucaoRecord[]) ?? []).filter(r => r.ciclo === cicloAtual)

    // Número de semanas dinâmico: max entre 8 e maior semana existente + 1
    const maxExisting = doseAtual.length > 0 ? Math.max(...doseAtual.map(r => r.semana)) : 0
    const total = Math.max(8, maxExisting + 1)
    setNumSemanas(total)

    const initial: Record<number, Partial<DoseRecord>> = {}
    const evoInitial: Record<number, { peso_kg: string; gordura_pct: string }> = {}
    for (let s = 1; s <= total; s++) {
      const found = doseAtual.find(r => r.semana === s)
      initial[s] = found ?? { semana: s }
      const foundEv = evoAtual.find(r => r.semana === s)
      evoInitial[s] = {
        peso_kg: foundEv?.peso_kg?.toString() ?? '',
        gordura_pct: foundEv?.gordura_pct?.toString() ?? '',
      }
    }
    setDoseForm(initial)
    setEvolucaoForm(evoInitial)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [id])

  // Assim que abrir a ficha, já leva a equipe direto pra proxima dose a preencher
  useEffect(() => {
    if (loading) return
    const cicloAtual = patient?.ciclo_atual ?? 1
    const doseAtual = doses.filter(d => d.ciclo === cicloAtual)
    const primeiraPendente = Array.from({ length: numSemanas }, (_, i) => i + 1)
      .find(s => !doseAtual.find(d => d.semana === s)?.data_aplicacao)
    if (!primeiraPendente) return
    const el = document.getElementById(`semana-${primeiraPendente}`)
    if (el) {
      const t = setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
      return () => clearTimeout(t)
    }
  }, [loading, id])

  const round2 = (n: number) => Math.round(n * 100) / 100
  const cicloAtual = patient?.ciclo_atual ?? 1
  const dosesAtual = doses.filter(d => d.ciclo === cicloAtual)
  const totalComprado = round2(purchases.reduce((acc, p) => acc + Number(p.quantidade_mg), 0))
  const totalAplicado = round2(doses.reduce((acc, d) => acc + Number(d.dose_mg ?? 0), 0))
  const totalAplicadoCiclosAnteriores = round2(doses.filter(d => d.ciclo < cicloAtual).reduce((acc, d) => acc + Number(d.dose_mg ?? 0), 0))
  const saldo = round2(totalComprado - totalAplicado)
  const proximaSemana = dosesAtual.length + 1
  const ciclosAnteriores = Array.from(new Set(doses.filter(d => d.ciclo < cicloAtual).map(d => d.ciclo))).sort((a, b) => b - a)

  const setField = (semana: number, field: string, value: string) =>
    setDoseForm((f) => {
      const updated = { ...f, [semana]: { ...f[semana], [field]: value } }
      if (field === 'data_aplicacao' && value) {
        const next = new Date(value + 'T12:00:00')
        next.setDate(next.getDate() + 7)
        updated[semana] = { ...updated[semana], proxima_data_aplicacao: next.toISOString().split('T')[0] }
      }
      return updated
    })

  const setEvoField = (semana: number, field: 'peso_kg' | 'gordura_pct', value: string) =>
    setEvolucaoForm((f) => ({ ...f, [semana]: { ...f[semana], [field]: value } }))

  async function uploadReceita(semana: number, file: File) {
    setUploadingPdf(semana)
    try {
      const ext = file.name.split('.').pop() ?? 'pdf'
      const path = `${id}/ciclo${cicloAtual}_semana_${semana}.${ext}`
      const { error } = await supabase.storage.from('receitas').upload(path, file, { upsert: true })
      if (error) throw error
      const { data: urlData } = supabase.storage.from('receitas').getPublicUrl(path)
      const receita_url = urlData.publicUrl
      // Salva URL no banco imediatamente
      const existing = dosesAtual.find(d => d.semana === semana)
      if (existing) {
        await supabase.from('pronutro_dose_records').update({ receita_url }).eq('id', existing.id)
      }
      setDoseForm(f => ({ ...f, [semana]: { ...f[semana], receita_url } }))
      setDoses(prev => prev.map(d => d.semana === semana && d.ciclo === cicloAtual ? { ...d, receita_url } : d))
    } catch (err) {
      alert('Erro ao fazer upload do PDF.')
      console.error(err)
    } finally {
      setUploadingPdf(null)
    }
  }

  async function removerReceita() {
    if (!confirm('Remover a receita médica anexada? Isso apaga o arquivo definitivamente.')) return
    setUploadingPdf(1)
    try {
      const { data: files } = await supabase.storage.from('receitas').list(id)
      const alvos = (files ?? []).filter(f => f.name.startsWith(`ciclo${cicloAtual}_semana_1`)).map(f => `${id}/${f.name}`)
      if (alvos.length) {
        const { error } = await supabase.storage.from('receitas').remove(alvos)
        if (error) throw error
      }
      const existing = dosesAtual.find(d => d.semana === 1)
      if (existing) {
        await supabase.from('pronutro_dose_records').update({ receita_url: null }).eq('id', existing.id)
      }
      setDoseForm(f => ({ ...f, 1: { ...f[1], receita_url: null } }))
      setDoses(prev => prev.map(d => d.semana === 1 && d.ciclo === cicloAtual ? { ...d, receita_url: null } : d))
    } catch (err) {
      alert('Erro ao remover o anexo.')
      console.error(err)
    } finally {
      setUploadingPdf(null)
    }
  }

  async function savePurchase() {
    if (!purchaseForm.quantidade_mg || !purchaseForm.data_compra) return
    setSavingPurchase(true)
    const { data: inserted, error } = await supabase.from('pronutro_purchases').insert({
      patient_id: id,
      data_compra: purchaseForm.data_compra,
      quantidade_mg: Number(purchaseForm.quantidade_mg),
      lote: purchaseForm.lote || null,
      observacoes: purchaseForm.observacoes || null,
    }).select('*').single()

    if (!error && inserted && purchaseReceitaFile) {
      try {
        const ext = purchaseReceitaFile.name.split('.').pop() ?? 'pdf'
        const path = `${id}/entrada_${inserted.id}.${ext}`
        const { error: upErr } = await supabase.storage.from('receitas').upload(path, purchaseReceitaFile, { upsert: true })
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('receitas').getPublicUrl(path)
          await supabase.from('pronutro_purchases').update({ receita_url: urlData.publicUrl }).eq('id', inserted.id)
        }
      } catch (err) {
        console.error(err)
      }
    }

    setPurchaseForm({ data_compra: '', quantidade_mg: '', lote: '', observacoes: '' })
    setPurchaseReceitaFile(null)
    if (purchaseReceitaInputRef.current) purchaseReceitaInputRef.current.value = ''
    const { data } = await supabase.from('pronutro_purchases').select('*').eq('patient_id', id).order('data_compra')
    setPurchases(data ?? [])
    setSavingPurchase(false)
  }

  async function deletePurchase(purchaseId: string) {
    await supabase.from('pronutro_purchases').delete().eq('id', purchaseId)
    setPurchases((prev) => prev.filter((p) => p.id !== purchaseId))
  }

  async function saveBioimpedancia() {
    if (!bioForm.data_exame || !bioFile) return
    setSavingBio(true)
    try {
      const ext = bioFile.name.split('.').pop() ?? 'pdf'
      const path = `${id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('bioimpedancia').upload(path, bioFile, { upsert: true })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('bioimpedancia').getPublicUrl(path)
      const { data: inserted, error } = await supabase.from('pronutro_bioimpedancia').insert({
        patient_id: id,
        data_exame: bioForm.data_exame,
        arquivo_url: urlData.publicUrl,
        observacoes: bioForm.observacoes || null,
      }).select().single()
      if (error) throw error
      setBioForm({ data_exame: '', observacoes: '' })
      setBioFile(null)
      if (bioFileInputRef.current) bioFileInputRef.current.value = ''
      const { data } = await supabase.from('pronutro_bioimpedancia').select('*').eq('patient_id', id).order('data_exame', { ascending: false })
      setBioimpedancias(data ?? [])
      if (inserted) analisarBioimpedancia(inserted.id)
    } catch (err) {
      alert('Erro ao anexar o exame de bioimpedância.')
      console.error(err)
    } finally {
      setSavingBio(false)
    }
  }

  async function analisarBioimpedancia(bioId: string) {
    setAnalisandoBio(a => ({ ...a, [bioId]: true }))
    try {
      const { data, error } = await supabase.functions.invoke('analyze-bioimpedancia', { body: { bioimpedancia_id: bioId } })
      if (error || !data?.analise) throw error ?? new Error('sem analise')
      setBioimpedancias(prev => prev.map(b => b.id === bioId ? { ...b, analise_gpt: data.analise, analise_gerada_em: new Date().toISOString() } : b))
    } catch (err) {
      console.error('analisarBioimpedancia', err)
    } finally {
      setAnalisandoBio(a => ({ ...a, [bioId]: false }))
    }
  }

  async function deleteBioimpedancia(bioId: string) {
    if (!confirm('Remover este exame de bioimpedância?')) return
    await supabase.from('pronutro_bioimpedancia').delete().eq('id', bioId)
    setBioimpedancias((prev) => prev.filter((b) => b.id !== bioId))
  }

  async function saveDose(semana: number) {
    setSaving(semana)
    const data = doseForm[semana]
    const sig = sigRefs.current[semana]
    const sigData = sig && !sig.isEmpty() ? sig.toDataURL() : (data.assinatura_paciente ?? null)
    const receitaSemana1 = doseForm[1]?.receita_url ?? dosesAtual.find(d => d.semana === 1)?.receita_url ?? null

    const payload: Partial<DoseRecord> & { patient_id: string; semana: number; ciclo: number } = {
      patient_id: id!,
      ciclo: cicloAtual,
      semana,
      dose_mg: data.dose_mg ?? null,
      proxima_dose_mg: data.proxima_dose_mg ?? null,
      proxima_data_aplicacao: data.proxima_data_aplicacao ?? null,
      data_compra: data.data_compra ?? null,
      data_aplicacao: data.data_aplicacao ?? null,
      lote: data.lote ?? null,
      observacoes: data.observacoes ?? null,
      assinatura_paciente: sigData,
      receita_url: data.receita_url ?? (semana > 1 ? receitaSemana1 : null),
    }

    const existing = dosesAtual.find((d) => d.semana === semana)
    if (existing) {
      await supabase.from('pronutro_dose_records').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('pronutro_dose_records').insert(payload)
    }

    const evo = evolucaoForm[semana]
    if (evo?.peso_kg) {
      await supabase.from('pronutro_evolucao').upsert({
        patient_id: id!,
        ciclo: cicloAtual,
        semana,
        peso_kg: Number(evo.peso_kg) || null,
        gordura_pct: evo.gordura_pct ? Number(evo.gordura_pct) : null,
        data_medicao: data.data_aplicacao ?? new Date().toISOString().split('T')[0],
      }, { onConflict: 'patient_id,ciclo,semana' })
      const { data: evUp } = await supabase.from('pronutro_evolucao').select('*').eq('patient_id', id).order('semana')
      setEvolucao(evUp ?? [])
    }

    if (sig && !sig.isEmpty() && (patient?.email || patient?.telefone)) {
      supabase.functions.invoke('send-dose-email', {
        body: {
          patient_name: patient.nome,
          patient_email: patient.email,
          patient_phone: patient.telefone,
          semana,
          dose_mg: data.dose_mg ?? null,
          proxima_dose_mg: data.proxima_dose_mg ?? null,
          data_aplicacao: data.data_aplicacao ?? null,
        },
      })
    }

    const { data: updated } = await supabase.from('pronutro_dose_records').select('*').eq('patient_id', id).order('semana')
    setDoses(updated ?? [])
    setActiveSig(null)
    setSaving(null)
  }

  async function savePatientEdit() {
    if (!patient) return
    setSavingEdit(true)
    await supabase.from('pronutro_patients').update(editForm).eq('id', patient.id)
    setPatient(p => p ? { ...p, ...editForm } : p)
    setEditingPatient(false)
    setSavingEdit(false)
  }

  async function enviarConfirmacaoProtocolo(tipo: 'termino' | 'novo') {
    if (!patient) return
    const { error } = await supabase.functions.invoke('send-protocol-confirmation', {
      body: { patient_id: patient.id, patient_name: patient.nome, patient_phone: patient.telefone, tipo },
    })
    if (error) {
      alert('Relatório enviado, mas houve erro ao mandar o botão de confirmação. Tente de novo pela ficha.')
      return
    }
    setPatient(p => p ? {
      ...p,
      protocolo_confirmacao_status: 'aguardando',
      protocolo_confirmacao_tipo: tipo,
      protocolo_confirmacao_enviado_em: new Date().toISOString(),
      protocolo_confirmacao_respondido_em: null,
    } : p)
  }

  async function finalizarProtocolo() {
    if (!patient) return
    const aplicadas = dosesAtual.filter(d => d.dose_mg != null)
    if (aplicadas.length === 0) {
      alert('Nenhuma dose aplicada registrada neste ciclo ainda.')
      return
    }
    const temReceita = dosesAtual.some(d => d.receita_url) || purchases.some(p => p.receita_url)
    const avisoReceita = temReceita ? '' : '\n\n(Nenhuma receita anexada — pode finalizar mesmo assim, só um lembrete pra pedir depois.)'
    if (!confirm(`Finalizar o protocolo de ${patient.nome}, enviar o relatório de doses aplicadas e pedir a confirmação do paciente por WhatsApp?${avisoReceita}`)) return
    setFinalizando(true)
    const { error } = await supabase.functions.invoke('send-protocol-report', {
      body: {
        patient_name: patient.nome,
        patient_phone: patient.telefone,
        doses: dosesAtual.map(d => ({ semana: d.semana, dose_mg: d.dose_mg, data_aplicacao: d.data_aplicacao })),
      },
    })
    if (error) {
      setFinalizando(false)
      alert('Erro ao enviar o relatório. Tente novamente.')
      return
    }

    // Arquiva o ciclo atual (fica salvo no histórico da ficha) e já inicia o próximo automaticamente
    const novoCiclo = cicloAtual + 1
    await supabase.from('pronutro_patients').update({ ciclo_atual: novoCiclo }).eq('id', patient.id)
    setPatient(p => p ? { ...p, ciclo_atual: novoCiclo } : p)
    setNumSemanas(8)
    setDoseForm({})
    setEvolucaoForm({})
    setExpandedWeeks({})

    await enviarConfirmacaoProtocolo('termino')
    setFinalizando(false)
    alert('Protocolo anterior salvo no histórico e novo ciclo já iniciado! O paciente vai receber no WhatsApp um relatório do que foi feito, junto com um botão pra confirmar que está de acordo com o término.')
  }

  async function iniciarNovoProtocolo() {
    if (!patient) return
    if (!confirm(`Enviar pro ${patient.nome} um aviso por WhatsApp de que um novo protocolo foi iniciado?`)) return
    setFinalizando(true)
    await enviarConfirmacaoProtocolo('novo')
    setFinalizando(false)
    alert('Aviso enviado ao paciente.')
  }

  async function toggleAtivo() {
    if (!patient) return
    const novoStatus = patient.ativo === false ? true : false
    const acao = novoStatus ? 'reativar' : 'inativar'
    if (!confirm(`Deseja ${acao} o paciente ${patient.nome}?`)) return
    setTogglingStatus(true)
    await supabase.from('pronutro_patients').update({ ativo: novoStatus }).eq('id', patient.id)
    setPatient((p) => p ? { ...p, ativo: novoStatus } : p)
    setTogglingStatus(false)
  }

  async function deletarPaciente() {
    if (!patient) return
    if (!confirm(`ATENÇÃO: Isso apagará permanentemente o paciente ${patient.nome} e todos os seus dados. Confirma?`)) return
    if (!confirm(`Última confirmação — apagar ${patient.nome} definitivamente?`)) return
    await supabase.from('pronutro_dose_records').delete().eq('patient_id', patient.id)
    await supabase.from('pronutro_purchases').delete().eq('patient_id', patient.id)
    await supabase.from('pronutro_contracts').delete().eq('patient_id', patient.id)
    await supabase.from('pronutro_patients').delete().eq('id', patient.id)
    navigate('/')
  }

  async function reenviarContrato() {
    if (!patient || !contract) return
    await supabase.functions.invoke('send-contract-email', {
      body: {
        patient_name: patient.nome,
        patient_email: patient.email,
        patient_phone: patient.telefone,
        contract_url: `https://controle-pronutro.vercel.app/contrato/${contract.token}`,
      },
    })
    alert('Email + WhatsApp reenviados!')
  }

  function addRetorno() {
    const next = numSemanas + 1
    setNumSemanas(next)
    setDoseForm(f => ({ ...f, [next]: f[next] ?? { semana: next } }))
    setEvolucaoForm(f => ({ ...f, [next]: f[next] ?? { peso_kg: '', gordura_pct: '' } }))
    // Rola até o novo retorno
    setTimeout(() => {
      document.getElementById(`semana-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  if (loading) return <div className="py-12 text-center text-gray-400">Carregando...</div>
  if (!patient) return <div className="py-12 text-center text-gray-400">Paciente não encontrado.</div>

  const contractUrl = contract ? `https://controle-pronutro.vercel.app/contrato/${contract.token}` : ''

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-brand hover:underline">← Voltar</Link>

      {/* Dados do paciente */}
      <div className={`bg-white rounded-xl border p-6 ${patient.ativo === false ? 'border-gray-300 bg-gray-50' : 'border-gray-200'}`}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div
            className="flex items-center gap-2 cursor-pointer select-none min-w-0"
            onClick={() => setShowPatientInfo(v => !v)}
            title={showPatientInfo ? 'Recolher dados do paciente' : 'Expandir dados do paciente'}
          >
            <span className="text-gray-400 text-sm shrink-0">{showPatientInfo ? '▾' : '▸'}</span>
            <h1 className="text-xl font-bold text-gray-800 truncate">{patient.nome}</h1>
            {patient.ativo === false && (
              <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium shrink-0">Inativo</span>
            )}
            {!showPatientInfo && (
              <span className="text-xs text-gray-400 font-normal shrink-0 hidden sm:inline">— {patient.medico_prescritor || 'sem médico'}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!editingPatient && (
              <button
                onClick={() => {
                  setEditForm({
                    nome: patient.nome, cpf: patient.cpf, email: patient.email,
                    telefone: patient.telefone, medico_prescritor: patient.medico_prescritor,
                    dosagem_inicial_mg: patient.dosagem_inicial_mg, observacoes: patient.observacoes,
                  })
                  setEditingPatient(true)
                  setShowPatientInfo(true)
                }}
                className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 font-medium transition-colors"
              >
                ✏️ Editar
              </button>
            )}
            <button
              onClick={toggleAtivo}
              disabled={togglingStatus}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50 ${
                patient.ativo === false
                  ? 'border-green-300 text-green-700 hover:bg-green-50'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {togglingStatus ? '...' : patient.ativo === false ? '✓ Reativar' : 'Inativar'}
            </button>
            <button
              onClick={finalizarProtocolo}
              disabled={finalizando}
              className="text-xs px-3 py-1.5 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 font-medium transition-colors disabled:opacity-50"
            >
              {finalizando ? 'Enviando...' : '✓ Finalizar Protocolo'}
            </button>
            <button
              onClick={iniciarNovoProtocolo}
              disabled={finalizando}
              className="text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 font-medium transition-colors disabled:opacity-50"
            >
              {finalizando ? 'Enviando...' : '▶ Iniciar Novo Protocolo'}
            </button>
            <button
              onClick={deletarPaciente}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 font-medium transition-colors"
            >
              Apagar
            </button>
          </div>
        </div>

        {patient.protocolo_confirmacao_status && (
          <div className="mb-4">
            {patient.protocolo_confirmacao_status === 'aguardando' && (
              <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
                ⏳ Aguardando confirmação do paciente sobre {patient.protocolo_confirmacao_tipo === 'novo' ? 'iniciar novo protocolo' : 'o término do protocolo'}
                {patient.protocolo_confirmacao_enviado_em && ` (enviado ${format(new Date(patient.protocolo_confirmacao_enviado_em), "dd/MM 'às' HH:mm", { locale: ptBR })})`}
              </span>
            )}
            {patient.protocolo_confirmacao_status === 'confirmado' && (
              <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full font-medium">
                ✓ Paciente confirmou {patient.protocolo_confirmacao_tipo === 'novo' ? 'o novo protocolo' : 'o término'}
                {patient.protocolo_confirmacao_respondido_em && ` em ${format(new Date(patient.protocolo_confirmacao_respondido_em), "dd/MM 'às' HH:mm", { locale: ptBR })}`}
              </span>
            )}
            {patient.protocolo_confirmacao_status === 'recusado' && (
              <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-full font-medium">
                ✕ Paciente NÃO confirmou {patient.protocolo_confirmacao_tipo === 'novo' ? 'o novo protocolo' : 'o término'} — falar com a clínica
              </span>
            )}
          </div>
        )}

        {showPatientInfo && (editingPatient ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Nome completo</label>
                <input
                  value={editForm.nome ?? ''}
                  onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">CPF</label>
                <input
                  value={editForm.cpf ?? ''}
                  onChange={e => setEditForm(f => ({ ...f, cpf: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email ?? ''}
                  onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Telefone</label>
                <input
                  value={editForm.telefone ?? ''}
                  onChange={e => setEditForm(f => ({ ...f, telefone: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Médico prescritor</label>
                <input
                  value={editForm.medico_prescritor ?? ''}
                  onChange={e => setEditForm(f => ({ ...f, medico_prescritor: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Dosagem inicial (mg)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.dosagem_inicial_mg ?? ''}
                  onChange={e => setEditForm(f => ({ ...f, dosagem_inicial_mg: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Observações</label>
              <textarea
                rows={2}
                value={editForm.observacoes ?? ''}
                onChange={e => setEditForm(f => ({ ...f, observacoes: e.target.value }))}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand resize-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={savePatientEdit}
                disabled={savingEdit}
                className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-50"
              >
                {savingEdit ? 'Salvando...' : 'Salvar alterações'}
              </button>
              <button
                onClick={() => setEditingPatient(false)}
                className="px-4 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div><span className="text-gray-500">CPF:</span><br /><span className="font-medium">{patient.cpf}</span></div>
              <div><span className="text-gray-500">Email:</span><br /><span className="font-medium">{patient.email}</span></div>
              <div><span className="text-gray-500">Telefone:</span><br /><span className="font-medium">{patient.telefone || '—'}</span></div>
              <div><span className="text-gray-500">Médico:</span><br /><span className="font-medium">{patient.medico_prescritor}</span></div>
              <div><span className="text-gray-500">Dosagem inicial:</span><br /><span className="font-medium">{patient.dosagem_inicial_mg ? `${patient.dosagem_inicial_mg} mg` : '—'}</span></div>
              <div><span className="text-gray-500">Cadastro:</span><br /><span className="font-medium">{format(new Date(patient.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span></div>
            </div>
            {patient.observacoes && (
              <div className="mt-3 text-sm bg-yellow-50 border border-yellow-100 rounded-lg p-3">
                <span className="text-yellow-700 font-medium">Obs:</span> {patient.observacoes}
              </div>
            )}
          </>
        ))}
      </div>

      {/* Estoque de Medicamento */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-bold text-gray-800 mb-4">Controle de Estoque — Tirzepatida</h2>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 sm:p-4 text-center">
            <p className="text-xs text-blue-500 font-medium mb-1">Comprado</p>
            <p className="text-lg sm:text-2xl font-bold text-blue-700">{totalComprado} mg</p>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 sm:p-4 text-center">
            <p className="text-xs text-orange-500 font-medium mb-1">Aplicado</p>
            <p className="text-lg sm:text-2xl font-bold text-orange-700">{totalAplicado} mg</p>
          </div>
          <div className={`border rounded-xl p-3 sm:p-4 text-center ${saldo > 0 ? 'bg-green-50 border-green-100' : saldo === 0 && totalComprado > 0 ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-100'}`}>
            <p className={`text-xs font-medium mb-1 ${saldo > 0 ? 'text-green-500' : 'text-red-500'}`}>Saldo</p>
            <p className={`text-lg sm:text-2xl font-bold ${saldo > 0 ? 'text-green-700' : saldo < 0 ? 'text-red-700' : 'text-gray-600'}`}>
              {saldo} mg
            </p>
            {saldo < 0 && <p className="text-xs text-red-500 mt-1">Negativo</p>}
          </div>
        </div>

        {purchases.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-500 mb-2">HISTÓRICO DE ENTRADAS</p>
            <div className="space-y-1.5">
              {purchases.map((pur) => (
                <div key={pur.id} className="flex items-start justify-between gap-2 bg-blue-50/50 border border-blue-100 rounded-lg px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 min-w-0">
                    <span className="text-blue-600 font-semibold">+{pur.quantidade_mg} mg</span>
                    <span className="text-gray-600">{format(new Date(pur.data_compra + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}</span>
                    {pur.lote && <span className="text-gray-400 text-xs">Lote: {pur.lote}</span>}
                    {pur.observacoes && <span className="text-gray-400 text-xs truncate max-w-[120px]">{pur.observacoes}</span>}
                    {pur.receita_url && (
                      <a href={pur.receita_url} target="_blank" rel="noopener noreferrer" className="text-brand text-xs font-medium hover:underline">
                        📄 Ver receita
                      </a>
                    )}
                  </div>
                  {isAdmin && (
                    <button onClick={() => deletePurchase(pur.id)} className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {doses.filter(d => d.dose_mg).length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-500 mb-2">SAÍDAS POR DOSE APLICADA</p>
            <div className="space-y-1.5">
              {doses.filter(d => d.dose_mg).map((d) => (
                <div key={d.id} className="flex items-center gap-3 bg-orange-50/50 border border-orange-100 rounded-lg px-3 py-2 text-sm">
                  <span className="text-orange-600 font-semibold">−{d.dose_mg} mg</span>
                  <span className="text-gray-600">{d.semana}ª semana</span>
                  {d.data_aplicacao && <span className="text-gray-400 text-xs">{format(new Date(d.data_aplicacao + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}</span>}
                  {d.lote && <span className="text-gray-400 text-xs">Lote: {d.lote}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 mb-3">REGISTRAR NOVA ENTRADA</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Data da compra *</label>
                <input type="date" value={purchaseForm.data_compra}
                  onChange={(e) => setPurchaseForm(f => ({ ...f, data_compra: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Quantidade (mg) *</label>
                <input type="number" step="0.5" placeholder="Ex: 10" value={purchaseForm.quantidade_mg}
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
                <input type="text" placeholder="Farmácia, recompra..." value={purchaseForm.observacoes}
                  onChange={(e) => setPurchaseForm(f => ({ ...f, observacoes: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Receita (PDF)</label>
                <div className="flex items-center gap-2">
                  <input ref={purchaseReceitaInputRef} type="file" accept="application/pdf"
                    onChange={(e) => setPurchaseReceitaFile(e.target.files?.[0] ?? null)}
                    className="flex-1 min-w-0 text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-brand/10 file:text-brand" />
                  {purchaseReceitaFile && (
                    <button type="button" onClick={() => { setPurchaseReceitaFile(null); if (purchaseReceitaInputRef.current) purchaseReceitaInputRef.current.value = '' }}
                      title="Remover arquivo selecionado" className="text-red-500 hover:text-red-700 text-sm font-bold flex-shrink-0">✕</button>
                  )}
                </div>
              </div>
            </div>
            <button onClick={savePurchase} disabled={savingPurchase || !purchaseForm.quantidade_mg || !purchaseForm.data_compra}
              className="mt-3 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
              {savingPurchase ? 'Salvando...' : '+ Registrar Entrada'}
            </button>
          </div>
        )}
      </div>

      {/* Bioimpedância (InBody) */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-bold text-gray-800 mb-1">Bioimpedância (InBody)</h2>
        <p className="text-xs text-gray-400 mb-4">Anexe o relatório entregue pela equipe InBody a cada exame.</p>

        {bioimpedancias.length > 0 && (
          <div className="space-y-2 mb-4">
            {bioimpedancias.map((b) => (
              <div key={b.id} className="bg-purple-50/50 border border-purple-100 rounded-lg px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 min-w-0">
                    <span className="text-purple-700 font-semibold">
                      {format(new Date(b.data_exame + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                    </span>
                    {b.observacoes && <span className="text-gray-400 text-xs truncate max-w-[200px]">{b.observacoes}</span>}
                    <a href={b.arquivo_url} target="_blank" rel="noopener noreferrer" className="text-brand text-xs font-medium hover:underline">
                      📄 Ver relatório
                    </a>
                  </div>
                  <button onClick={() => deleteBioimpedancia(b.id)} className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">✕</button>
                </div>

                <div className="mt-2 pt-2 border-t border-purple-100/70">
                  {analisandoBio[b.id] ? (
                    <p className="text-xs text-purple-400 italic">🤖 Gerando análise da IA...</p>
                  ) : b.analise_gpt ? (
                    <div>
                      <p className="text-xs font-semibold text-purple-600 mb-1">🤖 Análise da IA:</p>
                      <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{b.analise_gpt}</p>
                      <button onClick={() => analisarBioimpedancia(b.id)} className="text-xs text-purple-500 hover:underline mt-1">Reanalisar</button>
                    </div>
                  ) : (
                    <button onClick={() => analisarBioimpedancia(b.id)} className="text-xs text-purple-600 hover:underline">🤖 Gerar análise da IA</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-500 mb-3">ANEXAR NOVO EXAME</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Data do exame *</label>
              <input type="date" value={bioForm.data_exame}
                onChange={(e) => setBioForm(f => ({ ...f, data_exame: e.target.value }))}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Obs</label>
              <input type="text" placeholder="Opcional" value={bioForm.observacoes}
                onChange={(e) => setBioForm(f => ({ ...f, observacoes: e.target.value }))}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Relatório (PDF ou foto) *</label>
              <div className="flex items-center gap-2">
                <input ref={bioFileInputRef} type="file" accept="application/pdf,image/*"
                  onChange={(e) => setBioFile(e.target.files?.[0] ?? null)}
                  className="flex-1 min-w-0 text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-brand/10 file:text-brand" />
                {bioFile && (
                  <button type="button" onClick={() => { setBioFile(null); if (bioFileInputRef.current) bioFileInputRef.current.value = '' }}
                    title="Remover arquivo selecionado" className="text-red-500 hover:text-red-700 text-sm font-bold flex-shrink-0">✕</button>
                )}
              </div>
            </div>
          </div>
          <button onClick={saveBioimpedancia} disabled={savingBio || !bioForm.data_exame || !bioFile}
            className="mt-3 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50">
            {savingBio ? 'Salvando...' : '+ Anexar Exame'}
          </button>
        </div>
      </div>

      {/* Contrato */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800">Contrato TCLE</h2>
          {statusBadge(contract?.status)}
        </div>
        {contract ? (
          <div className="space-y-2 text-sm">
            {contract.status === 'signed' ? (
              <div className="flex items-center gap-2 text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                <span>✓</span>
                <span>Assinado em {format(new Date(contract.signed_at!), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-gray-500">Link (válido até {format(new Date(contract.expires_at), 'dd/MM/yyyy', { locale: ptBR })}):</p>
                <div className="flex gap-2">
                  <input readOnly value={contractUrl}
                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50" />
                  <button onClick={() => navigator.clipboard.writeText(contractUrl)}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs transition-colors">
                    Copiar
                  </button>
                </div>
                <button onClick={reenviarContrato} className="text-sm text-brand hover:underline">Reenviar por email →</button>
              </div>
            )}
            {contract.signature_data && contract.signature_data.startsWith('data:image') ? (
              <div className="mt-2">
                <p className="text-xs text-gray-400 mb-1">Assinatura registrada:</p>
                <img src={contract.signature_data} alt="Assinatura" className="border border-gray-200 rounded max-h-20" />
              </div>
            ) : contract.signature_data ? (
              <p className="text-xs text-green-600 mt-2">✓ Aceito via botão de concordância (sem assinatura desenhada)</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Contrato não gerado.</p>
        )}
      </div>

      {/* Gráfico de evolução */}
      <EvolucaoChart evolucao={evolucao} doses={doses} />

      {/* Doses */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="font-bold text-gray-800">
              Esquema de Doses{cicloAtual > 1 && <span className="ml-2 text-xs font-normal bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full align-middle">Ciclo {cicloAtual}</span>}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{numSemanas} semanas cadastradas · {dosesAtual.filter(d => d.data_aplicacao).length} aplicadas</p>
          </div>
          {saldo > 0 && proximaSemana <= numSemanas && (
            <div className="text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-green-700">
              Saldo p/ {proximaSemana}ª semana: <strong>{saldo} mg</strong>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {(() => {
            // Primeira semana sem data_aplicacao, em ordem — é a próxima que a equipe deve preencher
            const primeiraPendente = Array.from({ length: numSemanas }, (_, i) => i + 1)
              .find(s => !dosesAtual.find(d => d.semana === s)?.data_aplicacao)
            return Array.from({ length: numSemanas }, (_, i) => i + 1).map((semana) => {
            const saved = dosesAtual.find((d) => d.semana === semana)
            const form = doseForm[semana] ?? {}
            const isSaved = !!saved?.data_aplicacao
            const doseSemana = Number(saved?.dose_mg ?? 0)
            const saldoAposEsta = round2(totalComprado - totalAplicadoCiclosAnteriores - dosesAtual.filter(d => d.semana <= semana && d.dose_mg).reduce((a, d) => a + Number(d.dose_mg), 0))
            const receitaSemana1 = doseForm[1]?.receita_url ?? dosesAtual.find(d => d.semana === 1)?.receita_url ?? null
            const receitaUrl = (form.receita_url ?? saved?.receita_url) ?? (semana > 1 ? receitaSemana1 : null)
            const isPrimeira = semana === 1
            const isProxima = semana === primeiraPendente
            // Depois de preenchida, só admin pode editar — evita troca acidental de semana pela equipe
            const canEdit = !isSaved || isAdmin
            const inputCls = `w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand ${!canEdit ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`
            // Semana já preenchida vem colapsada por padrão (economiza espaço, deixa a pendente mais visível) — pendente sempre aberta
            const isExpanded = !isSaved || expandedWeeks[semana] === true

            return (
              <div
                key={semana}
                id={`semana-${semana}`}
                className={`border rounded-xl p-4 transition-colors scroll-mt-24 ${
                  isPrimeira
                    ? 'border-blue-300 bg-blue-50/40 ring-1 ring-blue-200'
                    : isSaved ? 'border-green-200 bg-green-50/30'
                    : isProxima ? 'border-amber-400 bg-amber-50/60 ring-2 ring-amber-400 shadow-md' : 'border-amber-200 bg-amber-50/40'
                }`}
              >
                <div
                  className={`flex items-center justify-between mb-3 ${isSaved ? 'cursor-pointer select-none' : ''}`}
                  onClick={isSaved ? () => setExpandedWeeks(w => ({ ...w, [semana]: !isExpanded })) : undefined}
                >
                  <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                    {isSaved && (
                      <span className="text-gray-400 text-xs">{isExpanded ? '▾' : '▸'}</span>
                    )}
                    {isPrimeira ? (
                      <span className="inline-flex items-center gap-1 bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                        🔑 1ª DOSE — INICIAL
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-orange-500 text-white text-sm font-black shadow-sm shrink-0">
                          {semana}
                        </span>
                        <span>ª Semana / Retorno</span>
                      </span>
                    )}
                    {isSaved && <span className="ml-1 text-xs text-green-600 font-normal">✓ Já preenchida</span>}
                    {!isSaved && isProxima && (
                      <span className="ml-1 inline-flex items-center gap-1 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                        👉 PRÓXIMA A PREENCHER
                      </span>
                    )}
                    {!isSaved && !isProxima && <span className="ml-1 text-xs text-amber-500 font-normal">● Pendente</span>}
                    {isSaved && !isAdmin && (
                      <span className="ml-1 text-xs text-gray-400 font-normal" title="Só admin pode editar depois de preenchido">🔒 bloqueado p/ edição</span>
                    )}
                  </h3>
                  {isSaved && doseSemana > 0 && (
                    <span className="text-xs text-gray-400">
                      Saída: <span className="text-orange-600 font-medium">−{doseSemana} mg</span>
                      {' '}→ Saldo após: <span className={`font-medium ${saldoAposEsta >= 0 ? 'text-green-600' : 'text-red-600'}`}>{saldoAposEsta} mg</span>
                    </span>
                  )}
                </div>

                {isExpanded && (
                <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Dose aplicada (mg)</label>
                    <input type="number" step="0.01"
                      value={form.dose_mg ?? ''}
                      disabled={!canEdit}
                      onChange={(e) => setField(semana, 'dose_mg', e.target.value)}
                      className={inputCls}
                      placeholder="2.5" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Próxima dose (mg)</label>
                    <input type="number" step="0.01"
                      value={form.proxima_dose_mg ?? ''}
                      disabled={!canEdit}
                      onChange={(e) => setField(semana, 'proxima_dose_mg', e.target.value)}
                      className={inputCls}
                      placeholder="5.0" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Data da aplicação</label>
                    <input type="date"
                      value={form.data_aplicacao ?? ''}
                      disabled={!canEdit}
                      onChange={(e) => setField(semana, 'data_aplicacao', e.target.value)}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Lote</label>
                    <input type="text"
                      value={form.lote ?? ''}
                      disabled={!canEdit}
                      onChange={(e) => setField(semana, 'lote', e.target.value)}
                      className={inputCls}
                      placeholder="AB1234" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-sm mb-3 pt-2 border-t border-gray-100">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">
                      Próx. aplicação
                      {form.data_aplicacao && !form.proxima_data_aplicacao && (
                        <span className="text-brand ml-1">(auto)</span>
                      )}
                    </label>
                    <input type="date"
                      value={form.proxima_data_aplicacao ?? ''}
                      disabled={!canEdit}
                      onChange={(e) => setField(semana, 'proxima_data_aplicacao', e.target.value)}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Peso (kg)</label>
                    <input type="number" step="0.1"
                      value={evolucaoForm[semana]?.peso_kg ?? ''}
                      disabled={!canEdit}
                      onChange={(e) => setEvoField(semana, 'peso_kg', e.target.value)}
                      className={inputCls}
                      placeholder="75.5" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">% Gordura <span className="text-gray-400">(opcional)</span></label>
                    <input type="number" step="0.1" min="0" max="100"
                      value={evolucaoForm[semana]?.gordura_pct ?? ''}
                      disabled={!canEdit}
                      onChange={(e) => setEvoField(semana, 'gordura_pct', e.target.value)}
                      className={inputCls}
                      placeholder="28.5" />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="text-xs text-gray-500 block mb-1">Observações</label>
                  <input type="text"
                    value={form.observacoes ?? ''}
                    disabled={!canEdit}
                    onChange={(e) => setField(semana, 'observacoes', e.target.value)}
                    className={inputCls}
                    placeholder="Reações, intercorrências..." />
                </div>

                {/* Receita médica PDF — anexo único, feito apenas na 1ª semana */}
                <div className="mb-3 pt-2 border-t border-gray-100">
                  <label className="text-xs text-gray-500 block mb-1.5">Receita médica (PDF)</label>
                  <div className="flex items-center gap-3 flex-wrap">
                    {semana === 1 ? (
                      <label className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        uploadingPdf === semana
                          ? 'opacity-50 cursor-not-allowed border-gray-200 text-gray-400'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                      }`}>
                        📎 {uploadingPdf === semana ? 'Enviando...' : receitaUrl ? 'Substituir PDF' : 'Anexar PDF'}
                        <input
                          type="file"
                          accept=".pdf,application/pdf"
                          className="sr-only"
                          disabled={uploadingPdf === semana}
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) uploadReceita(semana, file)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    ) : !receitaUrl ? (
                      <span className="text-xs text-gray-400">Nenhuma receita anexada na 1ª semana ainda.</span>
                    ) : null}
                    {receitaUrl && (
                      <a
                        href={`${receitaUrl}${receitaUrl.includes('?') ? '&' : '?'}download=`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                      >
                        📄 {semana === 1 ? 'Ver receita anexada' : 'Ver / baixar receita (da 1ª semana)'}
                      </a>
                    )}
                    {receitaUrl && semana === 1 && (
                      <button
                        type="button"
                        onClick={removerReceita}
                        disabled={uploadingPdf === 1}
                        className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline disabled:opacity-50"
                      >
                        🗑️ Remover anexo
                      </button>
                    )}
                  </div>
                </div>

                {/* Assinatura */}
                <div className="mb-3">
                  {saved?.assinatura_paciente && activeSig !== semana ? (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Assinatura do paciente:</p>
                      <img src={saved.assinatura_paciente} alt="Assinatura" className="border border-gray-200 rounded max-h-16" />
                      {canEdit && (
                        <button onClick={() => setActiveSig(semana)} className="text-xs text-brand hover:underline mt-1 block">Refazer</button>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Assinatura do paciente (opcional)</label>
                      <SignaturePad ref={(el) => { sigRefs.current[semana] = el }} />
                      <button onClick={() => sigRefs.current[semana]?.clear()} className="text-xs text-gray-400 hover:text-gray-600 mt-1">Limpar</button>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => saveDose(semana)}
                  disabled={saving === semana || !canEdit}
                  title={!canEdit ? 'Só admin pode editar uma dose já preenchida' : undefined}
                  className="w-full sm:w-auto bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-60"
                >
                  {!canEdit ? '🔒 Bloqueado (somente admin)' : saving === semana ? 'Salvando...' : isSaved ? 'Atualizar' : 'Salvar Dose'}
                </button>
                </>
                )}
              </div>
            )
          })
          })()}
        </div>

        {/* Botão adicionar retorno */}
        <button
          onClick={addRetorno}
          className="mt-4 w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-brand hover:text-brand font-medium transition-colors"
        >
          + Adicionar {numSemanas + 1}º Retorno
        </button>
      </div>

      {/* Histórico de protocolos anteriores — arquivado ao Finalizar Protocolo */}
      {ciclosAnteriores.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-bold text-gray-800 mb-3">Histórico de Protocolos</h2>
          <div className="space-y-2">
            {ciclosAnteriores.map((ciclo) => {
              const dosesCiclo = doses.filter(d => d.ciclo === ciclo).sort((a, b) => a.semana - b.semana)
              const evoCiclo = evolucao.filter(e => e.ciclo === ciclo).sort((a, b) => a.semana - b.semana)
              const aplicadasCiclo = dosesCiclo.filter(d => d.data_aplicacao)
              const isOpen = expandedCiclos[ciclo] === true
              const dataInicio = dosesCiclo[0]?.data_aplicacao
              const dataFim = aplicadasCiclo[aplicadasCiclo.length - 1]?.data_aplicacao
              return (
                <div key={ciclo} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedCiclos(c => ({ ...c, [ciclo]: !isOpen }))}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                  >
                    <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      <span className="text-gray-400 text-xs">{isOpen ? '▾' : '▸'}</span>
                      Ciclo {ciclo}
                      <span className="text-xs text-gray-400 font-normal">
                        {aplicadasCiclo.length} dose{aplicadasCiclo.length !== 1 ? 's' : ''} aplicada{aplicadasCiclo.length !== 1 ? 's' : ''}
                        {dataInicio && dataFim && ` · ${format(new Date(dataInicio + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })} a ${format(new Date(dataFim + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}`}
                      </span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="p-4 space-y-2">
                      {dosesCiclo.map((d) => {
                        const evo = evoCiclo.find(e => e.semana === d.semana)
                        return (
                          <div key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 border-b border-gray-100 pb-2 last:border-0">
                            <span className="font-semibold text-gray-700">{d.semana === 1 ? '1ª dose' : `${d.semana}ª semana`}</span>
                            <span>Dose: <b>{d.dose_mg ?? '—'} mg</b></span>
                            <span>Aplicada em: <b>{d.data_aplicacao ? format(new Date(d.data_aplicacao + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }) : '—'}</b></span>
                            {evo?.peso_kg != null && <span>Peso: <b>{evo.peso_kg} kg</b></span>}
                            {evo?.gordura_pct != null && <span>Gordura: <b>{evo.gordura_pct}%</b></span>}
                            {d.observacoes && <span className="text-gray-400">Obs: {d.observacoes}</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
