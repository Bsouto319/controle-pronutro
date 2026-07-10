-- Modulo financeiro: controle de pagamentos por paciente (substitui planilha Excel externa)
create table if not exists pronutro_pagamentos (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references pronutro_patients(id) on delete cascade,
  valor numeric(10,2) not null,
  data_pagamento date not null,
  forma_pagamento text not null default 'pix', -- pix, dinheiro, cartao_credito, cartao_debito, boleto, transferencia
  referente_a text not null default 'consulta', -- consulta, protocolo, mensalidade, produto, outro
  status text not null default 'pago', -- pago, pendente, cancelado
  observacoes text,
  registrado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pagamentos_patient on pronutro_pagamentos(patient_id);
create index if not exists idx_pagamentos_data on pronutro_pagamentos(data_pagamento);
create index if not exists idx_pagamentos_status on pronutro_pagamentos(status);

create or replace function update_updated_at_pagamentos()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_pagamentos on pronutro_pagamentos;
create trigger set_updated_at_pagamentos
  before update on pronutro_pagamentos
  for each row execute function update_updated_at_pagamentos();

alter table pronutro_pagamentos enable row level security;

-- Financeiro e' sensivel -- so admin/gerente le e mexe, igual ja vale pra estoque (pronutro_purchases)
drop policy if exists "only_admins_all_pagamentos" on pronutro_pagamentos;
create policy "only_admins_all_pagamentos"
  on pronutro_pagamentos
  as restrictive
  for all
  to authenticated
  using (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()));
