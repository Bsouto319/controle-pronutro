import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SignaturePad, { type SignaturePadHandle } from '../components/SignaturePad'
import type { Patient, Contract, DoseRecord, Purchase } from '../types'
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
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<number | null>(null)
  const [savingPurchase, setSavingPurchase] = useState(false)
  const [doseForm, setDoseForm] = useState<Record<number, Partial<DoseRecord>>>({})
  const [activeSig, setActiveSig] = useState<number | null>(null)
  const [purchaseForm, setPurchaseForm] = useState({ data_compra: '', quantidade_mg: '', lote: '', observacoes: '' })
  const sigRefs = useRef<Record<number, SignaturePadHandle | null>>({})

  async function loadData() {
    const [{ data: p }, { data: c }, { data: d }, { data: pur }] = await Promise.all([
      supabase.from('pronutro_patients').select('*').eq('id', id).single(),
      supabase.from('pronutro_contracts').select('*').eq('patient_id', id).single(),
      supabase.from('pronutro_dose_records').select('*').eq('patient_id', id).order('semana'),
      supabase.from('pronutro_purchases').select('*').eq('patient_id', id).order('data_compra'),
    ])
    setPatient(p)
    setContract(c)
    setDoses(d ?? [])
    setPurchases(pur ?? [])

    const initial: Record<number, Partial<DoseRecord>> = {}
    for (let s = 1; s <= 8; s++) {
      const found = d?.find((r: DoseRecord) => r.semana === s)
      initial[s] = found ?? { semana: s }
    }
    setDoseForm(initial)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [id])

  // Cálculos de estoque
  const totalComprado = purchases.reduce((acc, p) => acc + Number(p.quantidade_mg), 0)
  const totalAplicado = doses.reduce((acc, d) => acc + Number(d.dose_mg ?? 0), 0)
  const saldo = totalComprado - totalAplicado
  const proximaSemana = doses.length + 1

  const setField = (semana: number, field: string, value: string) =>
    setDoseForm((f) => ({ ...f, [semana]: { ...f[semana], [field]: value } }))

  async function savePurchase() {
    if (!purchaseForm.quantidade_mg || !purchaseForm.data_compra) return
    setSavingPurchase(true)
    await supabase.from('pronutro_purchases').insert({
      patient_id: id,
      data_compra: purchaseForm.data_compra,
      quantidade_mg: Number(purchaseForm.quantidade_mg),
      lote: purchaseForm.lote || null,
      observacoes: purchaseForm.observacoes || null,
    })
    setPurchaseForm({ data_compra: '', quantidade_mg: '', lote: '', observacoes: '' })
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

    const payload: Partial<DoseRecord> & { patient_id: string; semana: number } = {
      patient_id: id!,
      semana,
      dose_mg: data.dose_mg ?? null,
      proxima_dose_mg: data.proxima_dose_mg ?? null,
      data_compra: data.data_compra ?? null,
      data_aplicacao: data.data_aplicacao ?? null,
      lote: data.lote ?? null,
      observacoes: data.observacoes ?? null,
      assinatura_paciente: sigData,
    }

    const existing = doses.find((d) => d.semana === semana)
    if (existing) {
      await supabase.from('pronutro_dose_records').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('pronutro_dose_records').insert(payload)
    }

    // Envia email de confirmação ao paciente quando há assinatura nova
    if (sig && !sig.isEmpty() && patient?.email) {
      supabase.functions.invoke('send-dose-email', {
        body: {
          patient_name: patient.nome,
          patient_email: patient.email,
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

      {/* Estoque de Medicamento */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-bold text-gray-800 mb-4">Controle de Estoque — Tirzepatida</h2>

        {/* Cards resumo */}
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

        {/* Histórico de compras */}
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
                  </div>
                  <button onClick={() => deletePurchase(pur.id)} className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Saídas por dose */}
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

        {/* Registrar nova compra */}
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

      {/* Doses */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <h2 className="font-bold text-gray-800">Esquema de Doses (8 semanas)</h2>
          {saldo > 0 && proximaSemana <= 8 && (
            <div className="text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-green-700">
              Saldo p/ {proximaSemana}ª semana: <strong>{saldo} mg</strong>
            </div>
          )}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 8 }, (_, i) => i + 1).map((semana) => {
            const saved = doses.find((d) => d.semana === semana)
            const form = doseForm[semana] ?? {}
            const isSaved = !!saved?.data_aplicacao
            const doseSemana = Number(saved?.dose_mg ?? 0)
            const saldoAposEsta = totalComprado - doses.filter(d => d.semana <= semana && d.dose_mg).reduce((a, d) => a + Number(d.dose_mg), 0)

            return (
              <div key={semana}
                className={`border rounded-xl p-4 transition-colors ${isSaved ? 'border-green-200 bg-green-50/30' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-700">
                    {semana}ª Semana
                    {isSaved && <span className="ml-2 text-xs text-green-600 font-normal">✓ Aplicada</span>}
                  </h3>
                  {isSaved && doseSemana > 0 && (
                    <span className="text-xs text-gray-400">
                      Saída: <span className="text-orange-600 font-medium">−{doseSemana} mg</span>
                      {' '}→ Saldo após: <span className={`font-medium ${saldoAposEsta >= 0 ? 'text-green-600' : 'text-red-600'}`}>{saldoAposEsta} mg</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Dose aplicada (mg)</label>
                    <input type="number" step="0.5"
                      value={form.dose_mg ?? ''}
                      onChange={(e) => setField(semana, 'dose_mg', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                      placeholder="2.5" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Próxima dose (mg)</label>
                    <input type="number" step="0.5"
                      value={form.proxima_dose_mg ?? ''}
                      onChange={(e) => setField(semana, 'proxima_dose_mg', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                      placeholder="5.0" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Data da aplicação</label>
                    <input type="date"
                      value={form.data_aplicacao ?? ''}
                      onChange={(e) => setField(semana, 'data_aplicacao', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Lote</label>
                    <input type="text"
                      value={form.lote ?? ''}
                      onChange={(e) => setField(semana, 'lote', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                      placeholder="AB1234" />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="text-xs text-gray-500 block mb-1">Observações</label>
                  <input type="text"
                    value={form.observacoes ?? ''}
                    onChange={(e) => setField(semana, 'observacoes', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                    placeholder="Reações, intercorrências..." />
                </div>

                <div className="mb-3">
                  {saved?.assinatura_paciente && activeSig !== semana ? (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Assinatura do paciente:</p>
                      <img src={saved.assinatura_paciente} alt="Assinatura" className="border border-gray-200 rounded max-h-16" />
                      <button onClick={() => setActiveSig(semana)} className="text-xs text-brand hover:underline mt-1 block">Refazer</button>
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Assinatura do paciente (opcional)</label>
                      <SignaturePad ref={(el) => { sigRefs.current[semana] = el }} />
                      <button onClick={() => sigRefs.current[semana]?.clear()} className="text-xs text-gray-400 hover:text-gray-600 mt-1">Limpar</button>
                    </div>
                  )}
                </div>

                <button onClick={() => saveDose(semana)} disabled={saving === semana}
                  className="w-full sm:w-auto bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-60">
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
