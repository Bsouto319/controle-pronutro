-- Modulo de Orcamento: rascunho -> aprovado -> convertido em venda/lancamento
-- financeiro + baixa de estoque, reaproveitando paciente/medico/procedimento/
-- medicamento ja cadastrados (nunca duplicar).

create sequence if not exists pronutro_orcamento_numero_seq start 1;

create table if not exists pronutro_orcamentos (
  id uuid primary key default gen_random_uuid(),
  numero integer not null default nextval('pronutro_orcamento_numero_seq'),
  data date not null default current_date,
  validade date,
  patient_id uuid not null references pronutro_patients(id),
  medico_id uuid references pronutro_medicos(id),
  forma_pagamento text,
  parcelas integer not null default 1,
  desconto numeric(10,2) not null default 0,
  observacoes text,
  status text not null default 'rascunho', -- rascunho|enviado|aguardando_aprovacao|aprovado|recusado|cancelado|convertido
  pagamento_id uuid references pronutro_pagamentos(id), -- preenchido quando convertido em venda
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pronutro_orcamento_itens (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references pronutro_orcamentos(id) on delete cascade,
  medicamento_id uuid references pronutro_medicamentos(id),
  procedimento_id uuid references pronutro_procedimentos(id),
  nome text not null,
  quantidade numeric(10,2) not null default 1,
  unidade text not null default 'un',
  valor_unitario numeric(10,2) not null default 0,
  valor_total numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create or replace function update_updated_at_orcamentos()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_orcamentos on pronutro_orcamentos;
create trigger set_updated_at_orcamentos
  before update on pronutro_orcamentos
  for each row execute function update_updated_at_orcamentos();

alter table pronutro_orcamentos enable row level security;
alter table pronutro_orcamento_itens enable row level security;

drop policy if exists "authenticated_read_orcamentos" on pronutro_orcamentos;
create policy "authenticated_read_orcamentos"
  on pronutro_orcamentos for select to authenticated using (true);

drop policy if exists "only_admins_write_orcamentos" on pronutro_orcamentos;
create policy "only_admins_write_orcamentos"
  on pronutro_orcamentos as restrictive for all to authenticated
  using (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()));

drop policy if exists "authenticated_read_orcamento_itens" on pronutro_orcamento_itens;
create policy "authenticated_read_orcamento_itens"
  on pronutro_orcamento_itens for select to authenticated using (true);

drop policy if exists "only_admins_write_orcamento_itens" on pronutro_orcamento_itens;
create policy "only_admins_write_orcamento_itens"
  on pronutro_orcamento_itens as restrictive for all to authenticated
  using (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()));

comment on column pronutro_orcamentos.status is 'rascunho|enviado|aguardando_aprovacao|aprovado|recusado|cancelado|convertido';
comment on column pronutro_orcamentos.pagamento_id is 'Preenchido quando o orcamento e convertido em venda -- aponta pro lancamento financeiro gerado.';
