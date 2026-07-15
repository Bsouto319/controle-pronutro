-- Migration: ciclos de protocolo (histórico ao finalizar + novo ciclo automático)
-- Data: 2026-07-15

alter table pronutro_patients
  add column if not exists ciclo_atual integer not null default 1;

alter table pronutro_dose_records
  add column if not exists ciclo integer not null default 1;

alter table pronutro_evolucao
  add column if not exists ciclo integer not null default 1;

-- Troca a unicidade de (patient_id, semana) para (patient_id, ciclo, semana),
-- já que um novo ciclo reinicia a contagem de semana em 1.
alter table pronutro_dose_records
  drop constraint if exists pronutro_dose_records_patient_id_semana_key;
alter table pronutro_dose_records
  add constraint pronutro_dose_records_patient_id_ciclo_semana_key unique (patient_id, ciclo, semana);

alter table pronutro_evolucao
  drop constraint if exists pronutro_evolucao_patient_id_semana_key;
alter table pronutro_evolucao
  add constraint pronutro_evolucao_patient_id_ciclo_semana_key unique (patient_id, ciclo, semana);

create index if not exists idx_pronutro_dose_records_patient_ciclo on pronutro_dose_records(patient_id, ciclo);
create index if not exists idx_pronutro_evolucao_patient_ciclo on pronutro_evolucao(patient_id, ciclo);

comment on column pronutro_patients.ciclo_atual is 'Ciclo de protocolo em andamento. Ciclos < ciclo_atual sao historico (somente leitura na ficha).';
comment on column pronutro_dose_records.ciclo is 'A qual ciclo de protocolo esta dose pertence.';
comment on column pronutro_evolucao.ciclo is 'A qual ciclo de protocolo esta medicao pertence.';
