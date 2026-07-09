import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SignaturePad, { type SignaturePadHandle } from '../components/SignaturePad'
import EvolucaoChart from '../components/EvolucaoChart'
import { useIsAdmin } from '../hooks/useIsAdmin'
import type { Patient, Contract, DoseRecord, Purchase, EvolucaoRecord } from '../types'
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

  // Edição de dados do paciente
  const [editingPatient, setEditingPatient] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Patient>>({})
  const [savingEdit, setSavingEdit] = useState(false)

  const sigRefs = useRef<Record<number, SignaturePadHandle | null>>({})

  async function loadData() {
    const [{ data: p }, { data: c }, { data: d }, { data: pur }, { data: ev }] = await Promise.all([
      supabase.from('pronutro_patients').select('*').eq('id', id).single(),
      supabase.from('pronutro_contracts').select('*').eq('patient_id', id).single(),
      supabase.from('pronutro_dose_records').select('*').eq('patient_id', id).order('semana'),
      supabase.from('pronutro_purchases').select('*').eq('patient_id', id).order('data_compra'),
      supabase.from('pronutro_evolucao').select('*').eq('patient_id', id).order('semana'),
    ])
    setPatient(p)
    setContract(c)
    setDoses(d ?? [])
    setPurchases(pur ?? [])
    setEvolucao(ev ?? [])

    // Número de semanas dinâmico: max entre 8 e maior semana existente + 1
    const maxExisting = d && d.length > 0 ? Math.max(...(d as DoseRecord[]).map(r => r.semana)) : 0
    const total = Math.max(8, maxExisting + 1)
    setNumSemanas(total)

    const initial: Record<number, Partial<DoseRecord>> = {}
    const evoInitial: Record<number, { peso_kg: string; gordura_pct: string }> = {}
    for (let s = 1; s <= total; s++) {
      const found = (d as DoseRecord[])?.find(r => r.semana === s)
      initial[s] = found ?? { semana: s }
      const foundEv = (ev as EvolucaoRecord[])?.find(r => r.semana === s)
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

  const totalComprado = purchases.reduce((acc, p) => acc + Number(p.quantidade_mg), 0)
  const totalAplicado = doses.reduce((acc, d) => acc + Number(d.dose_mg ?? 0), 0)
  const saldo = totalComprado - totalAplicado
  const proximaSemana = doses.length + 1

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
      const path = `${id}/semana_${semana}.${ext}`
      const { error } = await supabase.storage.from('receitas').upload(path, file, { upsert: true })
      if (error) throw error
      const { data: urlData } = supabase.storage.from('receitas').getPublicUrl(path)
      const receita_url = urlData.publicUrl
      // Salva URL no banco imediatamente
      const existing = doses.find(d => d.semana === semana)
      if (existing) {
        await supabase.from('pronutro_dose_records').update({ receita_url }).eq('id', existing.id)
      }
      setDoseForm(f => ({ ...f, [semana]: { ...f[semana], receita_url } }))
      setDoses(prev => prev.map(d => d.semana === semana ? { ...d, receita_url } : d))
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
      const alvos = (files ?? []).filter(f => f.name.startsWith('semana_1')).map(f => `${id}/${f.name}`)
      if (alvos.length) {
        const { error } = await supabase.storage.from('receitas').remove(alvos)
        if (error) throw error
      }
      const existing = doses.find(d => d.semana === 1)
      if (existing) {
        await supabase.from('pronutro_dose_records').update({ receita_url: null }).eq('id', existing.id)
      }
      setDoseForm(f => ({ ...f, 1: { ...f[1], receita_url: null } }))
      setDoses(prev => prev.map(d => d.semana === 1 ? { ...d, receita_url: null } : d))
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
    const { data } = await supabase.from('pronutro_purchases').select('*').eq('patient_id', id).order('data_compra')
    setPurchases(data ?? [])
    setSavingPurchase(false)
  }

  async function deletePurchase(purchaseId: string) {
    await supabase.from('pronutro_purchases').delete().eq('id', purchaseId)
    setPurchases((prev) => prev.filter((p) => p.id !== purchaseId))
  }

  async function saveDose(semana: number) {
    setSaving(semana)
    const data = doseForm[semana]
    const sig = sigRefs.current[semana]
    const sigData = sig && !sig.isEmpty() ? sig.toDataURL() : (data.assinatura_paciente ?? null)
    const receitaSemana1 = doseForm[1]?.receita_url ?? doses.find(d => d.semana === 1)?.receita_url ?? null

    const payload: Partial<DoseRecord> & { patient_id: string; semana: number } = {
      patient_id: id!,
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

    const existing = doses.find((d) => d.semana === semana)
    if (existing) {
      await supabase.from('pronutro_dose_records').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('pronutro_dose_records').insert(payload)
    }

    const evo = evolucaoForm[semana]
    if (evo?.peso_kg) {
      await supabase.from('pronutro_evolucao').upsert({
        patient_id: id!,
        semana,
        peso_kg: Number(evo.peso_kg) || null,
        gordura_pct: evo.gordura_pct ? Number(evo.gordura_pct) : null,
        data_medicao: data.data_aplicacao ?? new Date().toISOString().split('T')[0],
      }, { onConflict: 'patient_id,semana' })
      const { data: evUp } = await supabase.from('pronutro_evolucao').select('*').eq('patient_id', id).order('semana')
      setEvolucao(evUp ?? [])
    }

    if (sig && !sig.isEmpty() && patient?.email) {
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

  async function finalizarProtocolo() {
    if (!patient) return
    const temReceita = doses.some(d => d.receita_url) || purchases.some(p => p.receita_url)
    if (!temReceita) {
      alert('Anexe a receita médica (na 1ª semana ou em algum registro de entrada) antes de finalizar o protocolo.')
      return
    }
    const aplicadas = doses.filter(d => d.dose_mg != null)
    if (aplicadas.length === 0) {
      alert('Nenhuma dose aplicada registrada ainda.')
      return
    }
    if (!confirm(`Finalizar o protocolo de ${patient.nome} e enviar o relatório de doses aplicadas por WhatsApp?`)) return
    setFinalizando(true)
    const { error } = await supabase.functions.invoke('send-protocol-report', {
      body: {
        patient_name: patient.nome,
        patient_phone: patient.telefone,
        doses: doses.map(d => ({ semana: d.semana, dose_mg: d.dose_mg, data_aplicacao: d.data_aplicacao })),
      },
    })
    setFinalizando(false)
    if (error) {
      alert('Erro ao enviar o relatório. Tente novamente.')
      return
    }
    alert('Relatório enviado! O paciente vai receber no WhatsApp.')
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
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-800">{patient.nome}</h1>
            {patient.ativo === false && (
              <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium">Inativo</span>
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
              onClick={deletarPaciente}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 font-medium transition-colors"
            >
              Apagar
            </button>
          </div>
        </div>

        {editingPatient ? (
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
        )}
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
                  <button onClick={() => deletePurchase(pur.id)} className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">✕</button>
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
              <input type="file" accept="application/pdf"
                onChange={(e) => setPurchaseReceitaFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-brand/10 file:text-brand" />
            </div>
          </div>
          <button onClick={savePurchase} disabled={savingPurchase || !purchaseForm.quantidade_mg || !purchaseForm.data_compra}
            className="mt-3 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
            {savingPurchase ? 'Salvando...' : '+ Registrar Entrada'}
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
            {contract.signature_data && (
              <div className="mt-2">
                <p className="text-xs text-gray-400 mb-1">Assinatura registrada:</p>
                <img src={contract.signature_data} alt="Assinatura" className="border border-gray-200 rounded max-h-20" />
              </div>
            )}
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
            <h2 className="font-bold text-gray-800">Esquema de Doses</h2>
            <p className="text-xs text-gray-400 mt-0.5">{numSemanas} semanas cadastradas · {doses.filter(d => d.data_aplicacao).length} aplicadas</p>
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
              .find(s => !doses.find(d => d.semana === s)?.data_aplicacao)
            return Array.from({ length: numSemanas }, (_, i) => i + 1).map((semana) => {
            const saved = doses.find((d) => d.semana === semana)
            const form = doseForm[semana] ?? {}
            const isSaved = !!saved?.data_aplicacao
            const doseSemana = Number(saved?.dose_mg ?? 0)
            const saldoAposEsta = totalComprado - doses.filter(d => d.semana <= semana && d.dose_mg).reduce((a, d) => a + Number(d.dose_mg), 0)
            const receitaSemana1 = doseForm[1]?.receita_url ?? doses.find(d => d.semana === 1)?.receita_url ?? null
            const receitaUrl = (form.receita_url ?? saved?.receita_url) ?? (semana > 1 ? receitaSemana1 : null)
            const isPrimeira = semana === 1
            const isProxima = semana === primeiraPendente
            // Depois de preenchida, só admin pode editar — evita troca acidental de semana pela equipe
            const canEdit = !isSaved || isAdmin
            const inputCls = `w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand ${!canEdit ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`

            return (
              <div
                key={semana}
                id={`semana-${semana}`}
                className={`border rounded-xl p-4 transition-colors ${
                  isPrimeira
                    ? 'border-blue-300 bg-blue-50/40 ring-1 ring-blue-200'
                    : isSaved ? 'border-green-200 bg-green-50/30'
                    : isProxima ? 'border-amber-400 bg-amber-50/60 ring-2 ring-amber-400 shadow-md' : 'border-amber-200 bg-amber-50/40'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-700 flex items-center gap-2">
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
    </div>
  )
}
