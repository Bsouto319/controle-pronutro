-- Bug real: as tabelas criadas hoje (medicos, procedimentos, metas,
-- orcamentos, orcamento_itens) tinham a politica de escrita como
-- "as restrictive" -- em Postgres, uma politica RESTRICTIVE sozinha NUNCA
-- concede acesso (so filtra em cima de uma politica PERMISSIVE existente).
-- Sem nenhuma politica permissive de escrita, INSERT/UPDATE/DELETE ficavam
-- bloqueados pra TODO mundo, inclusive admin -- confirmado com erro real
-- "new row violates row-level security policy" mesmo pro usuario admin.
--
-- Fix: recriar como politica permissiva normal (remove "as restrictive").
-- Mesma condicao de admin, so muda o TIPO da politica.

drop policy if exists "only_admins_write_medicos" on pronutro_medicos;
create policy "only_admins_write_medicos"
  on pronutro_medicos for all to authenticated
  using (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()));

drop policy if exists "only_admins_write_procedimentos" on pronutro_procedimentos;
create policy "only_admins_write_procedimentos"
  on pronutro_procedimentos for all to authenticated
  using (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()));

drop policy if exists "only_admins_write_metas" on pronutro_metas;
create policy "only_admins_write_metas"
  on pronutro_metas for all to authenticated
  using (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()));

drop policy if exists "only_admins_write_orcamentos" on pronutro_orcamentos;
create policy "only_admins_write_orcamentos"
  on pronutro_orcamentos for all to authenticated
  using (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()));

drop policy if exists "only_admins_write_orcamento_itens" on pronutro_orcamento_itens;
create policy "only_admins_write_orcamento_itens"
  on pronutro_orcamento_itens for all to authenticated
  using (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from pronutro_admins a where a.user_id = auth.uid()));
