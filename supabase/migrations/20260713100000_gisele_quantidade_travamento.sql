-- Adiciona quantidade de sessões contratadas (real) e trava de pacote pós-assinatura
-- para o sistema controle-gisele (mesmo projeto Supabase, tabelas gisele_*)

alter table gisele_patients
  add column if not exists quantidade_sessoes integer,
  add column if not exists pacote_travado_em timestamptz,
  add column if not exists pacote_concluido_notificado_em timestamptz;

comment on column gisele_patients.quantidade_sessoes is 'Numero real de sessoes contratadas no pacote. Define quantas abas de sessao aparecem.';
comment on column gisele_patients.pacote_travado_em is 'Quando preenchido, trava edicao de quantidade_sessoes/pacote_contratado/procedimento_contratado (paciente ja assinou pelo menos 1 sessao).';
comment on column gisele_patients.pacote_concluido_notificado_em is 'Quando preenchido, ja avisamos a Dra Gisele que o pacote foi concluido (evita notificar 2x).';
