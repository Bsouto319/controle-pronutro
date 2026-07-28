-- Multi-medicacao: cada pagamento pode referenciar uma medicacao + mg comprado.
-- Isso entra automaticamente no estoque do paciente (pronutro_purchases) e
-- desconta do estoque geral da clinica pra aquela medicacao.

create table if not exists pronutro_medicamentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  estoque_mg numeric(10,2) not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function update_updated_at_medicamentos()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_medicamentos on pronutro_medicamentos;
create trigger set_updated_at_medicamentos
  before update on pronutro_medicamentos
  for each row execute function update_updated_at_medicamentos();

insert into pronutro_medicamentos (nome)
  values ('Tirzepatida')
  on conflict (nome) do nothing;

alter table pronutro_purchases add column if not exists medicamento_id uuid references pronutro_medicamentos(id);
update pronutro_purchases set medicamento_id = (select id from pronutro_medicamentos where nome = 'Tirzepatida')
  where medicamento_id is null;

alter table pronutro_pagamentos add column if not exists medicamento_id uuid references pronutro_medicamentos(id);
alter table pronutro_pagamentos add column if not exists quantidade_mg numeric(10,2);

-- Desconta do estoque geral da clinica de forma atomica (evita race condition
-- de dois lancamentos simultaneos lendo o mesmo valor antigo).
create or replace function descontar_estoque_medicamento(p_medicamento_id uuid, p_quantidade_mg numeric)
returns void as $$
begin
  if not exists (select 1 from pronutro_admins a where a.user_id = auth.uid()) then
    raise exception 'Apenas admins podem alterar o estoque de medicamentos.';
  end if;

  update pronutro_medicamentos
  set estoque_mg = estoque_mg - p_quantidade_mg
  where id = p_medicamento_id;
end;
$$ language plpgsql security definer;

alter table pronutro_medicamentos enable row level security;

drop policy if exists "authenticated_read_medicamentos" on pronutro_medicamentos;
create policy "authenticated_read_medicamentos"
  on pronutro_medicamentos
  for select
  to authenticated
  using (true);

drop policy if exists "only_admins_write_medicamentos" on pronutro_medicamentos;
create policy "only_admins_write_medicamentos"
  on pronutro_medicamentos
  as restrictive
  for all
  to authenticated
  using (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()));
