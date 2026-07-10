import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Admin from './pages/Admin'
import NovoPaciente from './pages/NovoPaciente'
import Contrato from './pages/Contrato'
import Paciente from './pages/Paciente'
import Usuarios from './pages/Usuarios'
import Estoque from './pages/Estoque'
import Financeiro from './pages/Financeiro'
import LoginPage from './pages/LoginPage'
import ResetSenha from './pages/ResetSenha'

// Detecta #type=recovery do Supabase e redireciona para /reset-senha
function AuthHashHandler() {
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('type=recovery') && location.pathname !== '/reset-senha') {
      navigate('/reset-senha' + hash, { replace: true })
    }
  }, [])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthHashHandler />
      <Routes>
        {/* Página pública — paciente assina sem login */}
        <Route path="/contrato/:token" element={<Contrato />} />

        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-senha" element={<ResetSenha />} />

        {/* Painel protegido */}
        <Route path="/" element={
          <ProtectedRoute>
            <Layout><Admin /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/novo-paciente" element={
          <ProtectedRoute>
            <Layout><NovoPaciente /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/paciente/:id" element={
          <ProtectedRoute>
            <Layout><Paciente /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/usuarios" element={
          <ProtectedRoute>
            <Layout><Usuarios /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/estoque" element={
          <ProtectedRoute>
            <Layout><Estoque /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/financeiro" element={
          <ProtectedRoute>
            <Layout><Financeiro /></Layout>
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  )
}
