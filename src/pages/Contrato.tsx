import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SignaturePad, { type SignaturePadHandle } from '../components/SignaturePad'
import type { Patient, Contract } from '../types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function Contrato() {
  const { token } = useParams<{ token: string }>()
  const sigRef = useRef<SignaturePadHandle>(null)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [signing, setSigning] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: c } = await supabase
        .from('pronutro_contracts')
        .select('*')
        .eq('token', token)
        .single()

      if (!c) { setError('Contrato não encontrado.'); setLoading(false); return }
      if (c.status === 'signed') { setDone(true); setContract(c); setLoading(false) }
      if (new Date(c.expires_at) < new Date()) { setError('Este link expirou. Solicite um novo à clínica.'); setLoading(false); return }

      const { data: p } = await supabase
        .from('pronutro_patients')
        .select('*')
        .eq('id', c.patient_id)
        .single()

      setContract(c)
      setPatient(p)
      setLoading(false)
    }
    load()
  }, [token])

  async function sign() {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      setError('Por favor, assine no campo acima antes de confirmar.')
      return
    }
    setSigning(true)
    const sig = sigRef.current.toDataURL()

    const { error: e } = await supabase
      .from('pronutro_contracts')
      .update({
        status: 'signed',
        signature_data: sig,
        signed_at: new Date().toISOString(),
      })
      .eq('token', token)

    if (e) { setError('Erro ao salvar assinatura. Tente novamente.'); setSigning(false); return }
    setDone(true)
    setSigning(false)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400">Carregando contrato...</p>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-xl border border-red-200 p-8 max-w-md text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-red-600 font-medium">{error}</p>
      </div>
    </div>
  )

  if (done) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-xl border border-green-200 p-8 max-w-md text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">✓</span>
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Contrato Assinado!</h2>
        <p className="text-gray-500 text-sm">
          Sua assinatura foi registrada em{' '}
          {contract?.signed_at
            ? format(new Date(contract.signed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
            : 'data registrada'}
          . A Clínica ProNutro entrará em contato.
        </p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-brand px-6 py-5 text-white text-center">
            <div className="text-2xl font-bold tracking-tight">ProNutro</div>
            <div className="text-green-200 text-sm">Nutrologia e Terapias Integrativas</div>
          </div>

          {/* Contrato */}
          <div className="p-6 space-y-4 text-sm text-gray-700 leading-relaxed">
            <h2 className="text-lg font-bold text-gray-800 text-center">
              CONTRATO DE PRESTAÇÃO DE SERVIÇOS MÉDICOS E TCLE<br />
              <span className="text-sm font-normal text-gray-500">Aplicação de Tirzepatida (Mounjaro®)</span>
            </h2>

            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 text-sm">
              <p><strong>Paciente:</strong> {patient?.nome}</p>
              <p><strong>CPF:</strong> {patient?.cpf}</p>
              <p><strong>Médico Prescritor:</strong> {patient?.medico_prescritor}</p>
              {patient?.dosagem_inicial_mg && <p><strong>Dosagem Inicial:</strong> {patient.dosagem_inicial_mg} mg</p>}
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-gray-800">CLÁUSULA 1ª — DO OBJETO</h3>
              <p>O presente contrato tem por objeto a prestação de serviços médicos especializados pela <strong>Clínica ProNutro</strong>, consistentes na avaliação inicial, prescrição médica e administração subcutânea de <strong>tirzepatida</strong> (princípio ativo do medicamento Mounjaro®), exclusivamente nas dependências da Clínica ProNutro, para fins de controle glicêmico e/ou auxílio no emagrecimento.</p>
              <p>A posologia será aplicada subcutaneamente uma vez por semana, escalonando conforme avaliação individual. O medicamento é fornecido como componente essencial e inseparável do serviço.</p>

              <h3 className="font-semibold text-gray-800">CLÁUSULA 2ª — DO PREÇO E PAGAMENTO</h3>
              <p>O valor por sessão varia de acordo com a dosagem aplicada, incluindo consulta de monitoramento, aplicação subcutânea e fornecimento do medicamento. Pagamento: à vista por sessão (PIX, cartão ou boleto) ou parcelado em até 5x sem juros para pacotes.</p>

              <h3 className="font-semibold text-gray-800">CLÁUSULA 3ª — RISCOS E EFEITOS COLATERAIS</h3>
              <p><strong>Efeitos comuns:</strong> Náuseas, vômitos, diarreia, constipação, dor abdominal, fadiga, diminuição do apetite.</p>
              <p><strong>Efeitos graves/raros:</strong> Pancreatite aguda, colelitíase, hipoglicemia severa, reações alérgicas graves.</p>
              <p><strong>Contraindicações:</strong> Gravidez, amamentação, histórico de pancreatite ou carcinoma medular de tireoide.</p>
              <p><strong>Uso off-label:</strong> Para emagrecimento, o uso é off-label, baseado em evidências científicas internacionais (ensaios SURMOUNT) e autonomia do médico (Res. CFM 2.217/2018).</p>

              <h3 className="font-semibold text-gray-800">CLÁUSULA 4ª — OBRIGAÇÕES DO PACIENTE</h3>
              <p>Comparecer às sessões agendadas, aderir à prescrição e relatar imediatamente efeitos colaterais. Fornecer informações completas sobre histórico médico, alergias e medicamentos em uso.</p>

              <h3 className="font-semibold text-gray-800">CLÁUSULA 5ª — RESCISÃO</h3>
              <p>O paciente pode rescindir o contrato a qualquer tempo. Não haverá devolução de valores pagos por sessões realizadas. Ausência de mais de 2 sessões seguidas sem justificativa resulta em suspensão definitiva.</p>

              <h3 className="font-semibold text-gray-800">CLÁUSULA 6ª — LGPD</h3>
              <p>Seus dados são protegidos conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018) e serão utilizados exclusivamente para fins do tratamento.</p>
            </div>

            <div className="border-t border-gray-200 pt-4 mt-4">
              <p className="text-gray-600 text-xs mb-1">
                Brasília/DF, {format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
              <p className="text-gray-800 font-medium mb-3">
                Declaro ter lido, compreendido e concordado com todas as cláusulas acima. Assine abaixo:
              </p>

              <div className="mb-2">
                <label className="text-xs text-gray-500 block mb-1">Assinatura do Paciente — {patient?.nome}</label>
                <SignaturePad ref={sigRef} />
                <button
                  type="button"
                  onClick={() => sigRef.current?.clear()}
                  className="text-xs text-gray-400 hover:text-gray-600 mt-1"
                >
                  Limpar assinatura
                </button>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">{error}</p>}

              <button
                onClick={sign}
                disabled={signing}
                className="w-full bg-brand text-white py-3 rounded-xl font-semibold text-base hover:bg-brand-dark transition-colors disabled:opacity-60"
              >
                {signing ? 'Registrando assinatura...' : 'Confirmar Assinatura e Aceitar Contrato'}
              </button>

              <p className="text-xs text-gray-400 text-center mt-2">
                Ao confirmar, você concorda com os termos acima. Registro: IP + data/hora.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
