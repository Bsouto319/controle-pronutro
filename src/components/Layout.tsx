import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import ProNutroLogo from './ProNutroLogo'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useIsAdmin } from '../hooks/useIsAdmin'

function TrocarSenhaModal({ onClose }: { onClose: () => void }) {
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'ok' | 'err'>('idle')
  const [msg, setMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pwd !== confirm) { setStatus('err'); setMsg('As senhas não coincidem.'); return }
    if (pwd.length < 6) { setStatus('err'); setMsg('Mínimo 6 caracteres.'); return }
    const { error } = await supabase.auth.updateUser({ password: pwd })
    if (error) { setStatus('err'); setMsg('Erro ao salvar. Tente novamente.') }
    else setStatus('ok')
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-800">Trocar senha</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {status === 'ok' ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-sm font-medium text-gray-700">Senha alterada com sucesso!</p>
            <button onClick={onClose} className="mt-4 text-xs text-brand hover:underline">Fechar</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Nova senha</label>
              <input type="password" required value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Mínimo 6 caracteres"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/40" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Confirmar senha</label>
              <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repita a nova senha"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/40" />
            </div>
            {status === 'err' && <p className="text-xs text-red-500">{msg}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">Cancelar</button>
              <button type="submit" className="flex-1 bg-brand text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-dark transition-colors">Salvar</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function Layout({ children }: { readonly children: React.ReactNode }) {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const { isAdmin } = useIsAdmin()
  const firstName = user?.user_metadata?.name ?? user?.email?.split('@')[0] ?? 'Admin'
  const [showPwd, setShowPwd] = useState(false)

  const navItem = (to: string, label: string, mobileLabel: string) => {
    const active = pathname === to
    return (
      <Link
        to={to}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          active
            ? 'bg-brand text-white shadow-sm'
            : 'text-gray-600 hover:bg-gray-100 hover:text-brand'
        }`}
      >
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">{mobileLabel}</span>
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-green-50/30">
      {showPwd && <TrocarSenhaModal onClose={() => setShowPwd(false)} />}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-3 flex-shrink-0">
            <ProNutroLogo width={190} textColor="#2d2d2d" />
            <span className="hidden sm:inline-block text-xs text-gray-400 border-l border-gray-200 pl-3 leading-tight whitespace-nowrap">
              Controle de<br />Pacientes
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {navItem('/', 'Pacientes', 'Lista')}
            <Link
              to="/novo-paciente"
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === '/novo-paciente'
                  ? 'bg-brand text-white shadow-sm'
                  : 'bg-brand/10 text-brand hover:bg-brand hover:text-white'
              }`}
            >
              <span className="text-base leading-none">+</span>
              <span className="hidden sm:inline">Novo Paciente</span>
              <span className="sm:hidden">Novo</span>
            </Link>
            {navItem('/estoque', 'Estoque', '💊')}
            {isAdmin && navItem('/usuarios', 'Usuários', '👤')}
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-200">
              <span className="hidden sm:inline text-xs text-gray-400">{firstName}</span>
              <button
                onClick={() => setShowPwd(true)}
                title="Trocar senha"
                className="text-xs text-gray-500 hover:text-brand px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-brand/40 transition-colors"
              >
                🔑
              </button>
              <button
                onClick={() => supabase.auth.signOut()}
                className="text-xs text-gray-500 hover:text-red-500 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-red-200 transition-colors"
              >
                Sair
              </button>
            </div>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 sm:py-8">{children}</main>

      <footer className="border-t border-gray-100 mt-10 py-4 text-center">
        <p className="text-xs text-gray-400">
          ProNutro · Nutrologia e Terapias Integrativas · Sistema de Controle v1.0
        </p>
      </footer>
    </div>
  )
}
