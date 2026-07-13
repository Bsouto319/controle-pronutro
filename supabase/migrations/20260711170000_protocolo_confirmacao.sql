-- Confirmacao por botao (WhatsApp) de que o paciente esta de acordo com o
-- termino do protocolo atual, ou com o inicio de um novo protocolo.
alter table pronutro_patients
  add column if not exists protocolo_confirmacao_status text,
  add column if not exists protocolo_confirmacao_tipo text,
  add column if not exists protocolo_confirmacao_enviado_em timestamptz,
  add column if not exists protocolo_confirmacao_respondido_em timestamptz;

comment on column pronutro_patients.protocolo_confirmacao_status is 'null | aguardando | confirmado';
comment on column pronutro_patients.protocolo_confirmacao_tipo is 'termino | novo';
