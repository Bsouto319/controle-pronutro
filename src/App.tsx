import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Admin from './pages/Admin'
import NovoPaciente from './pages/NovoPaciente'
import Contrato from './pages/Contrato'
import Paciente from './pages/Paciente'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Página pública do contrato — sem layout admin */}
        <Route path="/contrato/:token" element={<Contrato />} />

        {/* Painel admin */}
        <Route element={<Layout><Admin /></Layout>} path="/" />
        <Route element={<Layout><NovoPaciente /></Layout>} path="/novo-paciente" />
        <Route element={<Layout><Paciente /></Layout>} path="/paciente/:id" />
      </Routes>
    </BrowserRouter>
  )
}
