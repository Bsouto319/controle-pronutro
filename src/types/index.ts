export interface Patient {
  id: string
  nome: string
  cpf: string
  email: string
  telefone: string
  medico_prescritor: string
  dosagem_inicial_mg: number | null
  observacoes: string | null
  ativo: boolean
  created_at: string
  protocolo_confirmacao_status: 'aguardando' | 'confirmado' | 'recusado' | null
  protocolo_confirmacao_tipo: 'termino' | 'novo' | null
  protocolo_confirmacao_enviado_em: string | null
  protocolo_confirmacao_respondido_em: string | null
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
  patient_id: string | null
  data_compra: string
  quantidade_mg: number
  lote: string | null
  observacoes: string | null
  receita_url: string | null
  created_at: string
}

export interface Pagamento {
  id: string
  patient_id: string
  valor: number
  data_pagamento: string
  forma_pagamento: string
  referente_a: string
  status: 'pago' | 'pendente' | 'cancelado'
  observacoes: string | null
  created_at: string
  updated_at: string
}

export interface Bioimpedancia {
  id: string
  patient_id: string
  data_exame: string
  arquivo_url: string
  observacoes: string | null
  created_at: string
  analise_gpt: string | null
  analise_gerada_em: string | null
}

export interface EstoqueConfig {
  id: number
  estoque_alerta_mg: number
  updated_at: string
}

export interface DoseRecord {
  id: string
  patient_id: string
  semana: number
  dose_mg: number | null
  data_compra: string | null
  data_aplicacao: string | null
  proxima_data_aplicacao: string | null
  lote: string | null
  observacoes: string | null
  proxima_dose_mg: number | null
  assinatura_paciente: string | null
  assinatura_profissional: string | null
  receita_url: string | null
}

export interface EvolucaoRecord {
  id: string
  patient_id: string
  semana: number
  peso_kg: number | null
  gordura_pct: number | null
  massa_muscular_kg: number | null
  data_medicao: string
  created_at: string
}
