import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { DoseRecord, EvolucaoRecord } from '../types'

interface Props {
  evolucao: EvolucaoRecord[]
  doses: DoseRecord[]
}

export default function EvolucaoChart({ evolucao, doses }: Props) {
  if (evolucao.length === 0) return null

  const data = Array.from({ length: 8 }, (_, i) => {
    const s = i + 1
    const ev = evolucao.find((e) => e.semana === s)
    const dose = doses.find((d) => d.semana === s)
    return {
      semana: `S${s}`,
      peso: ev?.peso_kg ? Number(ev.peso_kg) : null,
      gordura: ev?.gordura_pct ? Number(ev.gordura_pct) : null,
      dose: dose?.dose_mg ? Number(dose.dose_mg) : null,
    }
  })

  const pesoValues = data.filter((d) => d.peso !== null).map((d) => d.peso as number)
  const pesoMin = pesoValues.length ? Math.floor(Math.min(...pesoValues) - 3) : 60
  const pesoMax = pesoValues.length ? Math.ceil(Math.max(...pesoValues) + 3) : 120
  const perdido = pesoValues.length >= 2 ? (pesoValues[0] - pesoValues[pesoValues.length - 1]).toFixed(1) : null
  const temGordura = evolucao.some((e) => e.gordura_pct)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-gray-800">Evolução do Tratamento</h2>
        {perdido !== null && (
          <div className="flex gap-4 text-sm">
            <span className="text-gray-500">Início: <strong className="text-gray-800">{pesoValues[0]} kg</strong></span>
            <span className="text-gray-500">Atual: <strong className="text-green-700">{pesoValues[pesoValues.length - 1]} kg</strong></span>
            <span className="bg-green-50 border border-green-200 text-green-700 font-bold px-2 py-0.5 rounded-lg">
              −{perdido} kg
            </span>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 5, right: 40, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="semana" tick={{ fontSize: 12, fill: '#9ca3af' }} />
          <YAxis
            yAxisId="peso"
            domain={[pesoMin, pesoMax]}
            tick={{ fontSize: 11, fill: '#16a34a' }}
            tickFormatter={(v: number) => `${v}kg`}
            width={48}
          />
          <YAxis
            yAxisId="dose"
            orientation="right"
            tick={{ fontSize: 11, fill: '#ea580c' }}
            tickFormatter={(v: number) => `${v}mg`}
            width={40}
          />
          <Tooltip
            formatter={(value: any, name: any) => {
              if (name === 'Peso') return [`${value} kg`, name]
              if (name === 'Dose') return [`${value} mg`, name]
              if (name === '% Gordura') return [`${value}%`, name]
              return [value, String(name)]
            }}
            contentStyle={{ borderRadius: 8, fontSize: 13 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="dose" dataKey="dose" name="Dose" fill="#ffedd5" stroke="#ea580c" strokeWidth={1} radius={[3, 3, 0, 0]} />
          <Line
            yAxisId="peso"
            type="monotone"
            dataKey="peso"
            name="Peso"
            stroke="#16a34a"
            strokeWidth={2.5}
            dot={{ fill: '#16a34a', r: 4, strokeWidth: 0 }}
            connectNulls={false}
          />
          {temGordura && (
            <Line
              yAxisId="peso"
              type="monotone"
              dataKey="gordura"
              name="% Gordura"
              stroke="#8b5cf6"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={{ fill: '#8b5cf6', r: 3, strokeWidth: 0 }}
              connectNulls={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
