-- Rastreamento de no-show (paciente nao compareceu na quinta/sexta prevista)
-- e confirmacao de presenca via WhatsApp (mesmo padrao ja usado em protocolo_confirmacao).

alter table pronutro_dose_records
  add column if not exists retorno_confirmacao_status text check (retorno_confirmacao_status in ('aguardando', 'confirmado', 'recusado')),
  add column if not exists retorno_confirmacao_enviado_em timestamptz,
  add column if not exists retorno_confirmacao_respondido_em timestamptz,
  add column if not exists retorno_verificado_em timestamptz,
  add column if not exists no_show boolean not null default false;
