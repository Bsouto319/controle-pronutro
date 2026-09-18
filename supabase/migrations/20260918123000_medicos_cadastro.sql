-- Médico vira cadastro de verdade (antes era texto livre em
-- pronutro_patients.medico_prescritor) -- destrava repasse médico e
-- dashboard por médico. Preserva o texto livre existente: migra os
-- valores distintos já cadastrados como registros reais, sem duplicar
-- nem apagar nada.

create table if not exists pronutro_medicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  percentual_repasse numeric(5,2),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function update_updated_at_medicos()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_medicos on pronutro_medicos;
create trigger set_updated_at_medicos
  before update on pronutro_medicos
  for each row execute function update_updated_at_medicos();

alter table pronutro_medicos enable row level security;

drop policy if exists "authenticated_read_medicos" on pronutro_medicos;
create policy "authenticated_read_medicos"
  on pronutro_medicos
  for select
  to authenticated
  using (true);

drop policy if exists "only_admins_write_medicos" on pronutro_medicos;
create policy "only_admins_write_medicos"
  on pronutro_medicos
  as restrictive
  for all
  to authenticated
  using (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()));

-- Migra cada valor distinto já digitado em medico_prescritor pra um
-- registro real (trim + ignora vazio), sem duplicar.
insert into pronutro_medicos (nome)
select distinct trim(medico_prescritor)
from pronutro_patients
where medico_prescritor is not null and trim(medico_prescritor) <> ''
on conflict (nome) do nothing;

alter table pronutro_patients add column if not exists medico_id uuid references pronutro_medicos(id);
update pronutro_patients p
set medico_id = m.id
from pronutro_medicos m
where p.medico_id is null
  and p.medico_prescritor is not null
  and trim(p.medico_prescritor) = m.nome;

alter table pronutro_pagamentos add column if not exists medico_id uuid references pronutro_medicos(id);
-- Backfill de pagamentos antigos: usa o médico atual do paciente na falta
-- de outro sinal histórico (aproximação razoável, nunca tivemos médico por
-- pagamento antes disso).
update pronutro_pagamentos pg
set medico_id = p.medico_id
from pronutro_patients p
where pg.patient_id = p.id
  and pg.medico_id is null
  and p.medico_id is not null;

comment on column pronutro_patients.medico_id is 'FK pra pronutro_medicos. medico_prescritor (texto) continua existindo e sincronizado, pra não quebrar telas que só leem o texto.';
comment on column pronutro_pagamentos.medico_id is 'Médico responsável pelo lançamento -- usado pra repasse médico e dashboard por médico.';
