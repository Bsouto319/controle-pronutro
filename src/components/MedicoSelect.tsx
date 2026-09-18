import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Medico } from '../types'

interface Props {
  medicos: Medico[]
  medicoId: string
  onChange: (medicoId: string, nome: string) => void
  onCreated: (medico: Medico) => void
  className?: string
}

const NOVO = '__novo__'

// Select de médico reutilizado em NovoPaciente, Paciente (edição) e
// Financeiro (lançamento) -- cadastra médico novo inline sem sair da tela,
// pra não travar a equipe se um médico novo começar a atender.
export default function MedicoSelect({ medicos, medicoId, onChange, onCreated, className }: Props) {
  const [criando, setCriando] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [saving, setSaving] = useState(false)

  async function criarMedico() {
    const nome = novoNome.trim()
    if (!nome) return
    setSaving(true)
    const { data, error } = await supabase.from('pronutro_medicos').insert({ nome }).select().single()
    setSaving(false)
    if (error || !data) {
      alert('Erro ao cadastrar médico: ' + (error?.message ?? 'desconhecido'))
      return
    }
    onCreated(data as Medico)
    onChange(data.id, data.nome)
    setCriando(false)
    setNovoNome('')
  }

  if (criando) {
    return (
      <div className="flex gap-1.5">
        <input
          type="text" autoFocus placeholder="Nome do médico"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && criarMedico()}
          className={className ?? 'flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand'}
        />
        <button type="button" onClick={criarMedico} disabled={saving || !novoNome.trim()}
          className="px-2.5 py-1.5 bg-brand text-white rounded-lg text-xs font-medium disabled:opacity-50 whitespace-nowrap">
          {saving ? '...' : 'Salvar'}
        </button>
        <button type="button" onClick={() => { setCriando(false); setNovoNome('') }}
          className="px-2 py-1.5 text-gray-400 text-xs">✕</button>
      </div>
    )
  }

  return (
    <select
      value={medicoId}
      onChange={(e) => {
        if (e.target.value === NOVO) { setCriando(true); return }
        const m = medicos.find((med) => med.id === e.target.value)
        onChange(e.target.value, m?.nome ?? '')
      }}
      className={className ?? 'w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand'}
    >
      <option value="">Selecione...</option>
      {medicos.filter((m) => m.ativo).map((m) => (
        <option key={m.id} value={m.id}>{m.nome}</option>
      ))}
      <option value={NOVO}>+ Novo médico...</option>
    </select>
  )
}
