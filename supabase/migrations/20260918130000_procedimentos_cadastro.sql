-- Procedimento vira cadastro de verdade (antes só existia o enum fixo
-- referente_a em pronutro_pagamentos: consulta/protocolo/mensalidade/
-- produto/outro). Mantém referente_a como categoria macro (continua sendo
-- usado onde já é usado) e adiciona procedimento_id como o item específico
-- vendido, com valor padrão pra acelerar o lançamento.

create table if not exists pronutro_procedimentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  categoria text not null default 'outro', -- consulta|procedimento|tratamento|aplicacao|produto|outro
  valor_padrao numeric(10,2),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function update_updated_at_procedimentos()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_procedimentos on pronutro_procedimentos;
create trigger set_updated_at_procedimentos
  before update on pronutro_procedimentos
  for each row execute function update_updated_at_procedimentos();

alter table pronutro_procedimentos enable row level security;

drop policy if exists "authenticated_read_procedimentos" on pronutro_procedimentos;
create policy "authenticated_read_procedimentos"
  on pronutro_procedimentos
  for select
  to authenticated
  using (true);

drop policy if exists "only_admins_write_procedimentos" on pronutro_procedimentos;
create policy "only_admins_write_procedimentos"
  on pronutro_procedimentos
  as restrictive
  for all
  to authenticated
  using (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()));

alter table pronutro_pagamentos add column if not exists procedimento_id uuid references pronutro_procedimentos(id);

comment on column pronutro_pagamentos.procedimento_id is 'Item específico vendido (opcional, mais granular que referente_a).';
