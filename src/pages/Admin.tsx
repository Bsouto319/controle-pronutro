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
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">⏳ Aguardando</span>
  if (status === 'signed')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">✓ Assinado</span>
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200">✕ Expirado</span>
}

type FilterTab = 'ativos' | 'inativos' | 'todos'

export default function Admin() {
  const [patients, setPatients] = useState<PatientWithContract[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<FilterTab>('ativos')

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

  function exportCSV() {
    const rows = [
      ['Nome', 'CPF', 'Email', 'Telefone', 'Médico', 'Dosagem (mg)', 'Contrato', 'Assinado em', 'Cadastro'],
      ...patients.map((p) => [
        p.nome,
        p.cpf,
        p.email,
        p.telefone,
        p.medico_prescritor,
        p.dosagem_inicial_mg ?? '',
        p.contract?.status === 'signed' ? 'Assinado' : p.contract?.status === 'pending' ? 'Pendente' : 'Sem contrato',
        p.contract?.signed_at ? format(new Date(p.contract.signed_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '',
        format(new Date(p.created_at), 'dd/MM/yyyy', { locale: ptBR }),
      ]),
    ]
    const csv = 'sep=;\n' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pacientes-pronutro-${format(new Date(), 'dd-MM-yyyy')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const ativos = patients.filter((p) => p.ativo !== false)
  const inativos = patients.filter((p) => p.ativo === false)

  const byTab = tab === 'ativos' ? ativos : tab === 'inativos' ? inativos : patients

  const filtered = byTab.filter(
    (p) =>
      p.nome.toLowerCase().includes(search.toLowerCase()) ||
      p.cpf.includes(search)
  )

  const totalSigned = ativos.filter((p) => p.contract?.status === 'signed').length
  const totalPending = ativos.filter((p) => !p.contract || p.contract.status === 'pending').length

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
          <div className="text-2xl sm:text-3xl font-bold text-gray-800">{patients.length}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total</div>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-4 text-center shadow-sm">
          <div className="text-2xl sm:text-3xl font-bold text-green-700">{totalSigned}</div>
          <div className="text-xs text-green-600 mt-0.5">Assinados</div>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-4 text-center shadow-sm">
          <div className="text-2xl sm:text-3xl font-bold text-amber-600">{totalPending}</div>
          <div className="text-xs text-amber-600 mt-0.5">Aguardando</div>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
        {([['ativos', `Ativos (${ativos.length})`, 'text-green-700'], ['inativos', `Inativos (${inativos.length})`, 'text-gray-500'], ['todos', 'Todos', 'text-gray-600']] as const).map(([key, label, _]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Buscar por nome ou CPF..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 bg-white"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 px-3 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors font-medium bg-white"
          >
            ↓ <span className="hidden sm:inline">Exportar</span> CSV
          </button>
          <Link
            to="/novo-paciente"
            className="flex items-center gap-1.5 bg-brand text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-dark transition-colors shadow-sm"
          >
            + <span className="hidden sm:inline">Novo</span> Paciente
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="inline-flex flex-col items-center gap-3 text-gray-400">
            <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin"/>
            <span className="text-sm">Carregando pacientes...</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="text-4xl mb-3">🌿</div>
          <p className="text-gray-600 font-medium">Nenhum paciente encontrado</p>
          <p className="text-gray-400 text-sm mt-1 mb-4">
            {search ? 'Tente buscar por outro nome ou CPF.' : 'Comece cadastrando o primeiro paciente.'}
          </p>
          {!search && (
            <Link to="/novo-paciente" className="inline-flex items-center gap-1 text-brand underline text-sm font-medium">
              + Cadastrar primeiro paciente
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Cards — mobile */}
          <div className="sm:hidden space-y-2.5">
            {filtered.map((p) => (
              <Link
                key={p.id}
                to={`/paciente/${p.id}`}
                className={`block bg-white rounded-xl border p-4 hover:shadow-sm transition-all ${p.ativo === false ? 'border-gray-200 opacity-60' : 'border-gray-200 hover:border-brand/50'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-semibold truncate ${p.ativo === false ? 'text-gray-400' : 'text-gray-800'}`}>{p.nome}</p>
                      {p.ativo === false && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full flex-shrink-0">Inativo</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{p.cpf}</p>
                  </div>
                  <span className="text-brand text-sm font-semibold flex-shrink-0">Ver →</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {statusBadge(p.contract?.status)}
                  <span className="text-xs text-gray-400">{p.medico_prescritor}</span>
                  <span className="text-xs text-gray-300 ml-auto">
                    {format(new Date(p.created_at), 'dd/MM/yy', { locale: ptBR })}
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* Table — desktop */}
          <div className="hidden sm:block bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-brand to-brand-dark text-white">
                  <th className="text-left px-5 py-3 font-semibold text-sm">Paciente</th>
                  <th className="text-left px-5 py-3 font-semibold text-sm">CPF</th>
                  <th className="text-left px-5 py-3 font-semibold text-sm">Médico</th>
                  <th className="text-left px-5 py-3 font-semibold text-sm">Contrato</th>
                  <th className="text-left px-5 py-3 font-semibold text-sm">Cadastro</th>
                  <th className="px-5 py-3"/>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className={`transition-colors group ${p.ativo === false ? 'opacity-50' : 'hover:bg-green-50/40'}`}
                  >
                    <td className="px-5 py-3.5 font-medium text-gray-800">
                      <div className="flex items-center gap-2">
                        {p.nome}
                        {p.ativo === false && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Inativo</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 font-mono text-xs">{p.cpf}</td>
                    <td className="px-5 py-3.5 text-gray-600">{p.medico_prescritor}</td>
                    <td className="px-5 py-3.5">{statusBadge(p.contract?.status)}</td>
                    <td className="px-5 py-3.5 text-gray-400 text-xs">
                      {format(new Date(p.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                    </td>
                    <td className="px-5 py-3.5">
                      <Link
                        to={`/paciente/${p.id}`}
                        className="text-brand font-semibold text-sm hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Ver →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 0 && (
              <div className="px-5 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
                {filtered.length} paciente{filtered.length !== 1 ? 's' : ''} {search ? 'encontrado' : 'cadastrado'}{filtered.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
