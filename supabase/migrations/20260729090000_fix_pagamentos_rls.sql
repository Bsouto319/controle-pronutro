-- Bug real: a policy de pronutro_pagamentos foi criada RESTRICTIVE, mas essa
-- tabela nunca teve nenhuma policy PERMISSIVE (é tabela nova, sem policy legada
-- criada fora do controle de migrations, diferente de pronutro_purchases).
-- No Postgres, restrictive sem nenhuma permissive = acesso negado pra todo mundo,
-- admin ou nao. Era por isso que NENHUM pagamento nunca salvou, mesmo pra admin.
-- Fix: policy PERMISSIVE (comportamento equivalente ao pretendido: so admin mexe).

drop policy if exists "only_admins_all_pagamentos" on pronutro_pagamentos;
create policy "only_admins_all_pagamentos"
  on pronutro_pagamentos
  for all
  to authenticated
  using (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()));

-- Mesmo problema pode existir em pronutro_medicamentos (tabela nova de 28/07,
-- criada com o mesmo padrao restrictive-only).
drop policy if exists "only_admins_write_medicamentos" on pronutro_medicamentos;
create policy "only_admins_write_medicamentos"
  on pronutro_medicamentos
  for all
  to authenticated
  using (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()));
