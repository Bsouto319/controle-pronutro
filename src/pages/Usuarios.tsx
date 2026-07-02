import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface StaffUser {
  id: string
  email: string
  name: string | null
  created_at: string
  last_sign_in_at: string | null
}

export default function Usuarios() {
  const { isAdmin, loading: loadingAdmin } = useIsAdmin()
  const [users, setUsers] = useState<StaffUser[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nome: '', email: '' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)

  async function load() {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error: fnError } = await supabase.functions.invoke('pronutro-admin-users', {
      body: { action: 'list' },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    if (!fnError && data?.users) setUsers(data.users)
    setLoading(false)
  }

  useEffect(() => { if (isAdmin) load() }, [isAdmin])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setCreated(null)
    setCreating(true)
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error: fnError } = await supabase.functions.invoke('pronutro-admin-users', {
      body: { action: 'create', email: form.email, name: form.nome || undefined },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    setCreating(false)
    if (fnError || data?.error) {
      setError(data?.error || 'Erro ao criar usuário.')
      return
    }
    setCreated({ email: data.email, password: data.password })
    setForm({ nome: '', email: '' })
    load()
  }

  if (loadingAdmin) return <div className="py-12 text-center text-gray-400">Carregando...</div>
  if (!isAdmin) return <Navigate to="/" replace />

  const inputCls = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/60 bg-white transition-colors'
  const labelCls = 'block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide'

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Usuários do Sistema</h1>
        <p className="text-sm text-gray-400 mt-0.5">Adicione médicos e funcionários para terem acesso ao controle.</p>
      </div>

      <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-gray-700">+ Novo usuário</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Nome</label>
            <input
              value={form.nome}
              onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))}
              className={inputCls}
              placeholder="Nome completo"
            />
          </div>
          <div>
            <label className={labelCls}>Email *</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
              className={inputCls}
              placeholder="email@clinica.com"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            <span>⚠️</span> {error}
          </div>
        )}

        {created && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 space-y-1">
            <p className="font-semibold">✓ Usuário criado! Envie estes dados de acesso:</p>
            <p>Email: <strong>{created.email}</strong></p>
            <p>Senha provisória: <strong>{created.password}</strong></p>
          </div>
        )}

        <button
          type="submit"
          disabled={creating}
          className="bg-brand text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-brand-dark transition-colors disabled:opacity-60"
        >
          {creating ? 'Criando...' : '✓ Criar Usuário'}
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <h2 className="text-sm font-bold text-gray-700 px-5 pt-5 pb-3">Usuários com acesso</h2>
        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Carregando...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="text-left px-5 py-2.5 font-semibold">Nome</th>
                <th className="text-left px-5 py-2.5 font-semibold">Email</th>
                <th className="text-left px-5 py-2.5 font-semibold">Criado em</th>
                <th className="text-left px-5 py-2.5 font-semibold">Último acesso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id}>
                  <td className="px-5 py-3 text-gray-800">{u.name ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{u.email}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{format(new Date(u.created_at), 'dd/MM/yyyy', { locale: ptBR })}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{u.last_sign_in_at ? format(new Date(u.last_sign_in_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'Nunca'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
