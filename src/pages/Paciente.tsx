import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SignaturePad, { type SignaturePadHandle } from '../components/SignaturePad'
import type { Patient, Contract, DoseRecord } from '../types'
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
  const [patient, setPatient] = useState<Patient | null>(null)
  const [contract, setContract] = useState<Contract | null>(null)
  const [doses, setDoses] = useState<DoseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<number | null>(null)
  const [doseForm, setDoseForm] = useState<Record<number, Partial<DoseRecord>>>({})
  const [activeSig, setActiveSig] = useState<number | null>(null)
  const sigRefs = useRef<Record<number, SignaturePadHandle | null>>({})

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: c }, { data: d }] = await Promise.all([
        supabase.from('pronutro_patients').select('*').eq('id', id).single(),
        supabase.from('pronutro_contracts').select('*').eq('patient_id', id).single(),
        supabase.from('pronutro_dose_records').select('*').eq('patient_id', id).order('semana'),
      ])
      setPatient(p)
      setContract(c)
      setDoses(d ?? [])

      const initial: Record<number, Partial<DoseRecord>> = {}
      for (let s = 1; s <= 8; s++) {
        const found = d?.find((r: DoseRecord) => r.semana === s)
        initial[s] = found ?? { semana: s }
      }
      setDoseForm(initial)
      setLoading(false)
    }
    load()
  }, [id])

  const setField = (semana: number, field: string, value: string) =>
    setDoseForm((f) => ({ ...f, [semana]: { ...f[semana], [field]: value } }))

  async function saveDose(semana: number) {
    setSaving(semana)
    const data = doseForm[semana]
    const sig = sigRefs.current[semana]

    const payload: Partial<DoseRecord> & { patient_id: string; semana: number } = {
      patient_id: id!,
      semana,
      dose_mg: data.dose_mg ?? null,
      data_compra: data.data_compra ?? null,
      data_aplicacao: data.data_aplicacao ?? null,
      lote: data.lote ?? null,
      observacoes: data.observacoes ?? null,
      assinatura_paciente: sig && !sig.isEmpty() ? sig.toDataURL() : (data.assinatura_paciente ?? null),
    }

    const existing = doses.find((d) => d.semana === semana)

    if (existing) {
      await supabase.from('pronutro_dose_records').update(payload).eq('id', existing.id)
    } else {
      const { data: inserted } = await supabase.from('pronutro_dose_records').insert(payload).select().single()
      if (inserted) setDoses((prev) => [...prev, inserted])
    }

    const { data: updated } = await supabase.from('pronutro_dose_records').select('*').eq('patient_id', id).order('semana')
    setDoses(updated ?? [])
    setActiveSig(null)
    setSaving(null)
  }

  async function reenviarContrato() {
    if (!patient || !contract) return
    await supabase.functions.invoke('send-contract-email', {
      body: {
        patient_name: patient.nome,
        patient_email: patient.email,
        contract_url: `${window.location.origin}/contrato/${contract.token}`,
      },
    })
    alert('Email reenviado!')
  }

  if (loading) return <div className="py-12 text-center text-gray-400">Carregando...</div>
  if (!patient) return <div className="py-12 text-center text-gray-400">Paciente não encontrado.</div>

  const contractUrl = contract ? `${window.location.origin}/contrato/${contract.token}` : ''

  return (
    <div className="space-y-6">
      {/* Voltar */}
      <Link to="/" className="text-sm text-brand hover:underline">← Voltar</Link>

      {/* Dados do paciente */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h1 className="text-xl font-bold text-gray-800 mb-4">{patient.nome}</h1>
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
                <p className="text-gray-500">Link para assinatura (válido até {format(new Date(contract.expires_at), 'dd/MM/yyyy', { locale: ptBR })}):</p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={contractUrl}
                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(contractUrl)}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs transition-colors"
                  >
                    Copiar
                  </button>
                </div>
                <button
                  onClick={reenviarContrato}
                  className="text-sm text-brand hover:underline"
                >
                  Reenviar por email →
                </button>
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

      {/* Doses */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-bold text-gray-800 mb-4">Esquema de Doses — Tirzepatida (8 semanas)</h2>
        <div className="space-y-4">
          {Array.from({ length: 8 }, (_, i) => i + 1).map((semana) => {
            const saved = doses.find((d) => d.semana === semana)
            const form = doseForm[semana] ?? {}
            const isSaved = !!saved?.data_aplicacao

            return (
              <div
                key={semana}
                className={`border rounded-xl p-4 transition-colors ${isSaved ? 'border-green-200 bg-green-50/30' : 'border-gray-200'}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-700">
                    {semana}ª Semana
                    {isSaved && <span className="ml-2 text-xs text-green-600 font-normal">✓ Aplicada</span>}
                  </h3>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Dose (mg)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={form.dose_mg ?? ''}
                      onChange={(e) => setField(semana, 'dose_mg', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                      placeholder="2.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Data da compra</label>
                    <input
                      type="date"
                      value={form.data_compra ?? ''}
                      onChange={(e) => setField(semana, 'data_compra', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Data da aplicação</label>
                    <input
                      type="date"
                      value={form.data_aplicacao ?? ''}
                      onChange={(e) => setField(semana, 'data_aplicacao', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Lote</label>
                    <input
                      type="text"
                      value={form.lote ?? ''}
                      onChange={(e) => setField(semana, 'lote', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                      placeholder="AB1234"
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="text-xs text-gray-500 block mb-1">Observações</label>
                  <input
                    type="text"
                    value={form.observacoes ?? ''}
                    onChange={(e) => setField(semana, 'observacoes', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                    placeholder="Reações, intercorrências..."
                  />
                </div>

                {/* Assinatura do paciente */}
                <div className="mb-3">
                  {saved?.assinatura_paciente && activeSig !== semana ? (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Assinatura do paciente:</p>
                      <img src={saved.assinatura_paciente} alt="Assinatura" className="border border-gray-200 rounded max-h-16" />
                      <button onClick={() => setActiveSig(semana)} className="text-xs text-brand hover:underline mt-1 block">Refazer assinatura</button>
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
                  disabled={saving === semana}
                  className="w-full sm:w-auto bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-60"
                >
                  {saving === semana ? 'Salvando...' : isSaved ? 'Atualizar' : 'Salvar Dose'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
