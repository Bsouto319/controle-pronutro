import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ProNutroLogo from '../components/ProNutroLogo'

export default function NovoPaciente() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [form, setForm] = useState({
    nome: '',
    cpf: '',
    email: '',
    telefone: '',
    medico_prescritor: 'Dra. Vanessa',
    dosagem_inicial_mg: '',
    observacoes: '',
  })

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  const formatCPF = (v: string) => {
    const n = v.replace(/\D/g, '').slice(0, 11)
    return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }

  const formatPhone = (v: string) => {
    const n = v.replace(/\D/g, '').slice(0, 11)
    if (n.length <= 10) return n.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
    return n.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data: patient, error: pErr } = await supabase
      .from('pronutro_patients')
      .insert({
        nome: form.nome,
        cpf: form.cpf,
        email: form.email,
        telefone: form.telefone,
        medico_prescritor: form.medico_prescritor,
        dosagem_inicial_mg: form.dosagem_inicial_mg ? Number(form.dosagem_inicial_mg) : null,
        observacoes: form.observacoes || null,
      })
      .select()
      .single()

    if (pErr || !patient) {
      setError('Erro ao cadastrar paciente. Tente novamente.')
      setLoading(false)
      return
    }

    const { data: contract, error: cErr } = await supabase
      .from('pronutro_contracts')
      .insert({ patient_id: patient.id })
      .select()
      .single()

    if (cErr || !contract) {
      setError('Paciente cadastrado, mas erro ao gerar contrato.')
      setLoading(false)
      return
    }

    const contractUrl = `${window.location.origin}/contrato/${contract.token}`
    await supabase.functions.invoke('send-contract-email', {
      body: {
        patient_name: patient.nome,
        patient_email: patient.email,
        patient_phone: patient.telefone,
        contract_url: contractUrl,
      },
    })

    setSuccess(`Paciente cadastrado! Contrato enviado para ${patient.email}`)
    setLoading(false)
    setTimeout(() => navigate(`/paciente/${patient.id}`), 2000)
  }

  const inputCls = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/60 bg-white transition-colors'
  const labelCls = 'block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide'

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header card */}
      <div className="bg-gradient-to-r from-brand to-brand-dark rounded-2xl p-5 mb-6 text-white shadow-md">
        <ProNutroLogo width={220} textColor="#ffffff" />
        <p className="text-green-200 text-sm mt-3">Novo paciente — contrato LGPD enviado por e-mail e WhatsApp automaticamente</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Dados pessoais */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-700 mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
            <span className="w-5 h-5 bg-brand/10 rounded-full flex items-center justify-center text-brand text-xs font-bold">1</span>
            Dados Pessoais
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>Nome completo *</label>
              <input
                required
                value={form.nome}
                onChange={(e) => set('nome', e.target.value)}
                className={inputCls}
                placeholder="Nome completo do paciente"
              />
            </div>
            <div>
              <label className={labelCls}>CPF *</label>
              <input
                required
                value={form.cpf}
                onChange={(e) => set('cpf', formatCPF(e.target.value))}
                className={inputCls}
                placeholder="000.000.000-00"
              />
            </div>
            <div>
              <label className={labelCls}>Telefone / WhatsApp</label>
              <input
                value={form.telefone}
                onChange={(e) => set('telefone', formatPhone(e.target.value))}
                className={inputCls}
                placeholder="(61) 99999-9999"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Email *</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                className={inputCls}
                placeholder="email@paciente.com"
              />
            </div>
          </div>
        </div>

        {/* Dados clínicos */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-700 mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
            <span className="w-5 h-5 bg-brand/10 rounded-full flex items-center justify-center text-brand text-xs font-bold">2</span>
            Dados Clínicos
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Médico prescritor</label>
              <input
                value={form.medico_prescritor}
                onChange={(e) => set('medico_prescritor', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Dosagem inicial (mg)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={form.dosagem_inicial_mg}
                  onChange={(e) => set('dosagem_inicial_mg', e.target.value)}
                  className={inputCls + ' pr-10'}
                  placeholder="Ex: 2.5"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">mg</span>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Observações clínicas</label>
              <textarea
                rows={3}
                value={form.observacoes}
                onChange={(e) => set('observacoes', e.target.value)}
                className={inputCls + ' resize-none'}
                placeholder="Alergias, comorbidades, observações importantes..."
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            <span>⚠️</span> {error}
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">
            <span>✓</span> {success}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-5 py-3 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors font-medium bg-white"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-brand text-white px-5 py-3 rounded-xl text-sm font-bold hover:bg-brand-dark transition-colors disabled:opacity-60 shadow-sm flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                Cadastrando...
              </>
            ) : (
              '✓ Cadastrar e Enviar Contrato por Email'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
