export interface Patient {
  id: string
  nome: string
  cpf: string
  email: string
  telefone: string
  medico_prescritor: string
  dosagem_inicial_mg: number | null
  observacoes: string | null
  created_at: string
}

export interface Contract {
  id: string
  patient_id: string
  token: string
  status: 'pending' | 'signed' | 'expired'
  signature_data: string | null
  signed_at: string | null
  signed_ip: string | null
  expires_at: string
  created_at: string
}

export interface Purchase {
  id: string
  patient_id: string
  data_compra: string
  quantidade_mg: number
  lote: string | null
  observacoes: string | null
  created_at: string
}

export interface DoseRecord {
  id: string
  patient_id: string
  semana: number
  dose_mg: number | null
  data_compra: string | null
  data_aplicacao: string | null
  lote: string | null
  observacoes: string | null
  proxima_dose_mg: number | null
  assinatura_paciente: string | null
  assinatura_profissional: string | null
}
