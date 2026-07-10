import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Patient } from '../types'

interface Props {
  patients: Patient[]
  onClose: () => void
  onSuccess: () => void
}

const FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: 'paciente', label: 'Nome do paciente', required: true },
  { key: 'valor', label: 'Valor', required: true },
  { key: 'data_pagamento', label: 'Data', required: true },
  { key: 'forma_pagamento', label: 'Forma de pagamento' },
  { key: 'referente_a', label: 'Referente a' },
  { key: 'status', label: 'Status' },
  { key: 'observacoes', label: 'Observações' },
]

function parseCSV(text: string): string[][] {
  const clean = text.startsWith('﻿') ? text.slice(1) : text
  const lines = clean.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return []
  const first = lines[0]
  const semiCount = (first.match(/;/g) || []).length
  const commaCount = (first.match(/,/g) || []).length
  const sep = semiCount >= commaCount ? ';' : ','
  return lines.map((line) => {
    const cells: string[] = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
        else inQ = !inQ
      } else if (ch === sep && !inQ) {
        cells.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
    cells.push(cur.trim())
    return cells
  })
}

function autoMap(headers: string[]): Record<string, number> {
  const patterns: [string, string[]][] = [
    ['paciente', ['paciente', 'nome', 'name', 'cliente']],
    ['valor', ['valor', 'preco', 'preço', 'total', 'value']],
    ['data_pagamento', ['data', 'date', 'dia']],
    ['forma_pagamento', ['forma', 'pagamento', 'meio', 'metodo', 'método']],
    ['referente_a', ['referente', 'servico', 'serviço', 'produto', 'motivo']],
    ['status', ['status', 'situacao', 'situação']],
    ['observacoes', ['obs', 'observa', 'nota']],
  ]
  const map: Record<string, number> = {}
  headers.forEach((h, i) => {
    const hl = h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    for (const [field, kws] of patterns) {
      if (!(field in map) && kws.some((k) => hl.includes(k))) {
        map[field] = i
      }
    }
  })
  return map
}

function parseDateFlexible(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  // dd/mm/aaaa ou dd-mm-aaaa
  const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  // aaaa-mm-dd (já no formato certo)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

function normalizeForma(raw: string): string {
  const l = raw.toLowerCase()
  if (l.includes('pix')) return 'pix'
  if (l.includes('dinheiro') || l.includes('especie') || l.includes('espécie')) return 'dinheiro'
  if (l.includes('credito') || l.includes('crédito')) return 'cartao_credito'
  if (l.includes('debito') || l.includes('débito')) return 'cartao_debito'
  if (l.includes('boleto')) return 'boleto'
  if (l.includes('transfer')) return 'transferencia'
  if (l.includes('b16')) return 'b16'
  if (l.includes('pronutro')) return 'pronutro'
  return 'pix'
}

function normalizeStatus(raw: string): 'pago' | 'pendente' | 'cancelado' {
  const l = raw.toLowerCase()
  if (l.includes('pend')) return 'pendente'
  if (l.includes('cancel')) return 'cancelado'
  return 'pago'
}

type Step = 'idle' | 'preview' | 'importing' | 'done'

export default function ImportPagamentosCSVModal({ patients, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('idle')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string, number>>({})
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0, semPaciente: 0 })
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    setError('')
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const parsed = parseCSV(text)
      if (parsed.length < 2) {
        setError('Planilha vazia ou sem dados além do cabeçalho.')
        return
      }
      const hdrs = parsed[0]
      const dataRows = parsed.slice(1).filter((r) => r.some((c) => c))
      setHeaders(hdrs)
      setRows(dataRows)
      setMapping(autoMap(hdrs))
      setStep('preview')
    }
    reader.readAsText(file, 'UTF-8')
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDrag(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function setMap(field: string, colIdx: number) {
    setMapping((prev) => {
      const next = { ...prev }
      if (colIdx === -1) { delete next[field]; return next }
      return { ...next, [field]: colIdx }
    })
  }

  function getCell(row: string[], field: string) {
    const idx = mapping[field]
    return idx !== undefined ? row[idx] ?? '' : ''
  }

  function findPatientId(nome: string): string | null {
    const alvo = nome.trim().toLowerCase()
    if (!alvo) return null
    const exato = patients.find((p) => p.nome.trim().toLowerCase() === alvo)
    if (exato) return exato.id
    const parcial = patients.find((p) => p.nome.trim().toLowerCase().includes(alvo) || alvo.includes(p.nome.trim().toLowerCase()))
    return parcial?.id ?? null
  }

  async function doImport() {
    const total = rows.length
    setProgress({ done: 0, total, errors: 0, semPaciente: 0 })
    setStep('importing')
    let errors = 0
    let semPaciente = 0
    const BATCH = 50
    for (let i = 0; i < rows.length; i += BATCH) {
      const batchRows = rows.slice(i, i + BATCH)
      const batch: Record<string, unknown>[] = []
      for (const row of batchRows) {
        const nomePaciente = getCell(row, 'paciente')
        const patientId = findPatientId(nomePaciente)
        if (!patientId) { semPaciente++; continue }
        const data = parseDateFlexible(getCell(row, 'data_pagamento'))
        if (!data) { errors++; continue }
        const valorStr = getCell(row, 'valor').replace(/[^\d,.-]/g, '').replace(',', '.')
        const valor = parseFloat(valorStr)
        if (isNaN(valor)) { errors++; continue }
        batch.push({
          patient_id: patientId,
          valor,
          data_pagamento: data,
          forma_pagamento: normalizeForma(getCell(row, 'forma_pagamento') || 'pix'),
          referente_a: getCell(row, 'referente_a') || 'consulta',
          status: normalizeStatus(getCell(row, 'status') || 'pago'),
          observacoes: getCell(row, 'observacoes') || null,
        })
      }
      if (batch.length) {
        const { error } = await supabase.from('pronutro_pagamentos').insert(batch)
        if (error) errors += batch.length
      }
      setProgress({ done: Math.min(i + BATCH, total), total, errors, semPaciente })
    }
    setProgress((p) => ({ ...p, errors, semPaciente }))
    setStep('done')
    if (errors === 0 && semPaciente === 0) onSuccess()
    else onSuccess()
  }

  const mappedOk = 'paciente' in mapping && 'valor' in mapping && 'data_pagamento' in mapping

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-800">Importar Pagamentos via Planilha</h2>
            {step === 'preview' && (
              <p className="text-xs text-gray-400 mt-0.5">{rows.length} lançamento{rows.length !== 1 ? 's' : ''} detectado{rows.length !== 1 ? 's' : ''}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          {step === 'idle' && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Faça upload da sua planilha (.csv). Precisa ter pelo menos <strong>nome do paciente</strong>, <strong>valor</strong> e <strong>data</strong>.
                O nome é casado com os pacientes já cadastrados — se não achar um paciente com nome parecido, aquela linha fica de fora.
              </p>
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${drag ? 'border-brand bg-brand/5' : 'border-gray-200 hover:border-brand/50 hover:bg-gray-50'}`}
              >
                <div className="text-4xl mb-3">📂</div>
                <p className="text-sm font-medium text-gray-700">Clique ou arraste o arquivo aqui</p>
                <p className="text-xs text-gray-400 mt-1">CSV com separador ; ou ,  •  UTF-8 ou ANSI</p>
              </div>
              <input ref={inputRef} type="file" accept=".csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              {error && <p className="text-sm text-red-500 mt-3 text-center">{error}</p>}
              <div className="mt-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-500 font-medium mb-1">Dica:</p>
                <p className="text-xs text-gray-400">Se sua planilha é .xlsx, abra no Excel/Google Sheets e exporte/salve como CSV primeiro.</p>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">Mapeamento de colunas:</p>
              <div className="grid grid-cols-2 gap-2 mb-5">
                {FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-36 flex-shrink-0">
                      {f.label}{f.required && <span className="text-red-400"> *</span>}
                    </span>
                    <select
                      value={mapping[f.key] ?? -1}
                      onChange={(e) => setMap(f.key, parseInt(e.target.value))}
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand/40"
                    >
                      <option value={-1}>— não importar —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-500 font-medium mb-2">Prévia (primeiros 3 registros):</p>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {FIELDS.filter((f) => f.key in mapping).map((f) => (
                        <th key={f.key} className="text-left px-3 py-2 text-gray-500 font-medium whitespace-nowrap">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.slice(0, 3).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {FIELDS.filter((f) => f.key in mapping).map((f) => (
                          <td key={f.key} className="px-3 py-2 text-gray-700 truncate max-w-[140px]">{getCell(row, f.key) || <span className="text-gray-300">—</span>}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 3 && (
                <p className="text-xs text-gray-400 mt-1 text-right">+ {rows.length - 3} mais</p>
              )}
              {!mappedOk && (
                <p className="text-sm text-red-500 mt-3 bg-red-50 rounded-xl px-3 py-2">Mapeie <strong>Nome do paciente</strong>, <strong>Valor</strong> e <strong>Data</strong> para continuar.</p>
              )}
            </div>
          )}

          {step === 'importing' && (
            <div className="py-8 text-center">
              <div className="w-10 h-10 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
              <p className="text-sm text-gray-700 font-medium">Importando pagamentos...</p>
              <p className="text-xs text-gray-400 mt-1">{progress.done} de {progress.total}</p>
              <div className="w-full bg-gray-100 rounded-full h-1.5 mt-4 overflow-hidden">
                <div
                  className="bg-brand h-1.5 rounded-full transition-all duration-300"
                  style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : '0%' }}
                />
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="py-8 text-center">
              <div className="text-5xl mb-4">{progress.errors === 0 && progress.semPaciente === 0 ? '✅' : '⚠️'}</div>
              <p className="text-base font-semibold text-gray-800">
                {progress.total - progress.errors - progress.semPaciente} lançamento{(progress.total - progress.errors - progress.semPaciente) !== 1 ? 's' : ''} importado{(progress.total - progress.errors - progress.semPaciente) !== 1 ? 's' : ''}!
              </p>
              {progress.semPaciente > 0 && (
                <p className="text-sm text-amber-600 mt-1">{progress.semPaciente} linha{progress.semPaciente !== 1 ? 's' : ''} sem paciente encontrado com nome parecido — ficaram de fora.</p>
              )}
              {progress.errors > 0 && (
                <p className="text-sm text-red-500 mt-1">{progress.errors} linha{progress.errors !== 1 ? 's' : ''} com valor ou data inválidos.</p>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          {step === 'idle' && (
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">Cancelar</button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => setStep('idle')} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">← Voltar</button>
              <button
                onClick={doImport}
                disabled={!mappedOk}
                className="px-5 py-2 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50"
              >
                Importar {rows.length} lançamento{rows.length !== 1 ? 's' : ''}
              </button>
            </>
          )}
          {step === 'done' && (
            <button onClick={onClose} className="px-5 py-2 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors">
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
