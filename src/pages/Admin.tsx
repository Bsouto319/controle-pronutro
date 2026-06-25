import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Patient, Contract } from '../types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface PatientWithContract extends Patient {
  contract?: Contract
}

const statusBadge = (status?: string) => {
  if (!status || status === 'pending')
    return <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">Aguardando assinatura</span>
  if (status === 'signed')
    return <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Assinado ✓</span>
  return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">Expirado</span>
}

export default function Admin() {
  const [patients, setPatients] = useState<PatientWithContract[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      const { data: pts } = await supabase
        .from('pronutro_patients')
        .select('*')
        .order('created_at', { ascending: false })

      if (!pts) return setLoading(false)

      const { data: contracts } = await supabase
        .from('pronutro_contracts')
        .select('*')

      const merged = pts.map((p) => ({
        ...p,
        contract: contracts?.find((c) => c.patient_id === p.id),
      }))
      setPatients(merged)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = patients.filter(
    (p) =>
      p.nome.toLowerCase().includes(search.toLowerCase()) ||
      p.cpf.includes(search)
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Pacientes</h1>
          <p className="text-sm text-gray-500">{patients.length} cadastrado{patients.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          to="/novo-paciente"
          className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors"
        >
          + Novo Paciente
        </Link>
      </div>

      <input
        type="text"
        placeholder="Buscar por nome ou CPF..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-4 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
      />

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          Nenhum paciente encontrado.{' '}
          <Link to="/novo-paciente" className="text-brand underline">Cadastrar primeiro paciente</Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Paciente</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">CPF</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Médico</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Contrato</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Cadastro</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr
                  key={p.id}
                  className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}
                >
                  <td className="px-4 py-3 font-medium text-gray-800">{p.nome}</td>
                  <td className="px-4 py-3 text-gray-600">{p.cpf}</td>
                  <td className="px-4 py-3 text-gray-600">{p.medico_prescritor}</td>
                  <td className="px-4 py-3">{statusBadge(p.contract?.status)}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {format(new Date(p.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/paciente/${p.id}`}
                      className="text-brand hover:underline font-medium"
                    >
                      Ver →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
