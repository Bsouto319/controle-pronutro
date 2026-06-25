import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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
    const emailBody = {
      patient_name: patient.nome,
      patient_email: patient.email,
      contract_url: contractUrl,
    }

    await supabase.functions.invoke('send-contract-email', { body: emailBody })

    setSuccess(`Paciente cadastrado! Contrato enviado para ${patient.email}`)
    setLoading(false)
    setTimeout(() => navigate(`/paciente/${patient.id}`), 2000)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Novo Paciente</h1>
        <p className="text-sm text-gray-500">O contrato será enviado por email automaticamente</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo *</label>
            <input
              required
              value={form.nome}
              onChange={(e) => set('nome', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Nome do paciente"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CPF *</label>
            <input
              required
              value={form.cpf}
              onChange={(e) => set('cpf', formatCPF(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="000.000.000-00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefone / WhatsApp</label>
            <input
              value={form.telefone}
              onChange={(e) => set('telefone', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="(61) 99999-9999"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="email@paciente.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Médico prescritor</label>
            <input
              value={form.medico_prescritor}
              onChange={(e) => set('medico_prescritor', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dosagem inicial (mg)</label>
            <input
              type="number"
              step="0.5"
              value={form.dosagem_inicial_mg}
              onChange={(e) => set('dosagem_inicial_mg', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Ex: 2.5"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea
              rows={3}
              value={form.observacoes}
              onChange={(e) => set('observacoes', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
              placeholder="Alergias, comorbidades, observações clínicas..."
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        {success && <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">{success}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-60"
          >
            {loading ? 'Cadastrando...' : 'Cadastrar e Enviar Contrato por Email'}
          </button>
        </div>
      </form>
    </div>
  )
}
