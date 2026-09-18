-- Campos financeiros que faltavam em pronutro_pagamentos (bandeira, banco/
-- operadora, taxa de cartão, valor líquido, status de recebimento, NF,
-- imposto, indicação, custo clínica, data de atendimento separada da data
-- de pagamento) + tabela de Metas (mensal, por médico e/ou procedimento).
-- Tudo nullable/com default seguro -- não quebra nenhum lançamento existente.

alter table pronutro_pagamentos add column if not exists data_atendimento date;
update pronutro_pagamentos set data_atendimento = data_pagamento where data_atendimento is null;

alter table pronutro_pagamentos add column if not exists bandeira text;
alter table pronutro_pagamentos add column if not exists banco_operadora text;
alter table pronutro_pagamentos add column if not exists taxa_cartao numeric(10,2);
alter table pronutro_pagamentos add column if not exists valor_liquido numeric(10,2);
alter table pronutro_pagamentos add column if not exists data_deposito date;
alter table pronutro_pagamentos add column if not exists status_recebimento text; -- pendente|a_receber|recebido|cancelado|estornado|divergente
alter table pronutro_pagamentos add column if not exists indicacao text;
alter table pronutro_pagamentos add column if not exists nf_numero text;
alter table pronutro_pagamentos add column if not exists nf_valor numeric(10,2);
alter table pronutro_pagamentos add column if not exists imposto numeric(10,2);
alter table pronutro_pagamentos add column if not exists custo_clinica numeric(10,2);

comment on column pronutro_pagamentos.data_atendimento is 'Data em que o atendimento/procedimento aconteceu -- pode diferir de data_pagamento.';
comment on column pronutro_pagamentos.banco_operadora is 'Operadora/adquirente do cartão (Stone, Cielo, Rede...), texto livre.';
comment on column pronutro_pagamentos.status_recebimento is 'Status do recebimento pra pagamentos via operadora de cartão: pendente, a_receber, recebido, cancelado, estornado, divergente.';
comment on column pronutro_pagamentos.custo_clinica is 'Custo manual quando não é coberto pelo cálculo automático de medicação (custo_mg x quantidade_mg).';

create table if not exists pronutro_metas (
  id uuid primary key default gen_random_uuid(),
  mes text not null, -- 'YYYY-MM'
  medico_id uuid references pronutro_medicos(id), -- null = meta da clínica inteira
  procedimento_id uuid references pronutro_procedimentos(id), -- null = qualquer procedimento
  valor_meta numeric(10,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mes, medico_id, procedimento_id)
);

create or replace function update_updated_at_metas()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_metas on pronutro_metas;
create trigger set_updated_at_metas
  before update on pronutro_metas
  for each row execute function update_updated_at_metas();

alter table pronutro_metas enable row level security;

drop policy if exists "authenticated_read_metas" on pronutro_metas;
create policy "authenticated_read_metas"
  on pronutro_metas
  for select
  to authenticated
  using (true);

drop policy if exists "only_admins_write_metas" on pronutro_metas;
create policy "only_admins_write_metas"
  on pronutro_metas
  as restrictive
  for all
  to authenticated
  using (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()));
