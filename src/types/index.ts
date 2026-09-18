export interface Patient {
  id: string
  nome: string
  cpf: string
  email: string
  telefone: string
  medico_prescritor: string
  medico_id: string | null
  dosagem_inicial_mg: number | null
  observacoes: string | null
  ativo: boolean
  created_at: string
  protocolo_confirmacao_status: 'aguardando' | 'confirmado' | 'recusado' | 'notificado' | null
  protocolo_confirmacao_tipo: 'termino' | 'novo' | null
  protocolo_confirmacao_enviado_em: string | null
  protocolo_confirmacao_respondido_em: string | null
  ciclo_atual: number
}

export interface Medico {
  id: string
  nome: string
  percentual_repasse: number | null
  ativo: boolean
  created_at: string
  updated_at: string
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
  medicamento_id: string | null
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
  medicamento_id: string | null
  quantidade_mg: number | null
  medico_id: string | null
  procedimento_id: string | null
  data_atendimento: string | null
  bandeira: string | null
  banco_operadora: string | null
  taxa_cartao: number | null
  valor_liquido: number | null
  data_deposito: string | null
  status_recebimento: 'pendente' | 'a_receber' | 'recebido' | 'cancelado' | 'estornado' | 'divergente' | null
  indicacao: string | null
  nf_numero: string | null
  nf_valor: number | null
  imposto: number | null
  custo_clinica: number | null
  created_at: string
  updated_at: string
}

export interface Procedimento {
  id: string
  nome: string
  categoria: string
  valor_padrao: number | null
  ativo: boolean
  created_at: string
  updated_at: string
}

export type OrcamentoStatus = 'rascunho' | 'enviado' | 'aguardando_aprovacao' | 'aprovado' | 'recusado' | 'cancelado' | 'convertido'

export interface Orcamento {
  id: string
  numero: number
  data: string
  validade: string | null
  patient_id: string
  medico_id: string | null
  forma_pagamento: string | null
  parcelas: number
  desconto: number
  observacoes: string | null
  status: OrcamentoStatus
  pagamento_id: string | null
  created_at: string
  updated_at: string
}

export interface OrcamentoItem {
  id: string
  orcamento_id: string
  medicamento_id: string | null
  procedimento_id: string | null
  nome: string
  quantidade: number
  unidade: string
  valor_unitario: number
  valor_total: number
  created_at: string
}

export interface Meta {
  id: string
  mes: string
  medico_id: string | null
  procedimento_id: string | null
  valor_meta: number
  created_at: string
  updated_at: string
}

export interface Medicamento {
  id: string
  nome: string
  estoque_mg: number
  ativo: boolean
  created_at: string
  updated_at: string
  custo_mg: number | null
  is_principal: boolean
  estoque_minimo: number | null
}

export interface Bioimpedancia {
  id: string
  patient_id: string
  data_exame: string
  arquivo_url: string
  observacoes: string | null
  created_at: string
  analise_gpt: string | null
  analise_paciente: string | null
  analise_gerada_em: string | null
  enviado_paciente_em: string | null
}

export interface EstoqueConfig {
  id: number
  estoque_alerta_mg: number
  updated_at: string
}

export interface DoseRecord {
  id: string
  patient_id: string
  ciclo: number
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
  retorno_confirmacao_status: 'aguardando' | 'confirmado' | 'recusado' | null
  retorno_confirmacao_enviado_em: string | null
  retorno_confirmacao_respondido_em: string | null
  retorno_verificado_em: string | null
  no_show: boolean
}

export interface EvolucaoRecord {
  id: string
  patient_id: string
  ciclo: number
  semana: number
  peso_kg: number | null
  gordura_pct: number | null
  massa_muscular_kg: number | null
  data_medicao: string
  created_at: string
}
