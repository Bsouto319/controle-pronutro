-- Reforca no banco (nao so na UI) que apenas admins podem registrar/apagar
-- entradas de estoque (pronutro_purchases). Usa policy RESTRICTIVE, que
-- sempre se soma (AND) a qualquer policy permissiva ja existente, sem
-- precisar conhecer ou remover policies antigas.

alter table pronutro_purchases enable row level security;

drop policy if exists "only_admins_insert_purchases" on pronutro_purchases;
create policy "only_admins_insert_purchases"
  on pronutro_purchases
  as restrictive
  for insert
  to authenticated
  with check (
    exists (select 1 from pronutro_admins a where a.user_id = auth.uid())
  );

drop policy if exists "only_admins_delete_purchases" on pronutro_purchases;
create policy "only_admins_delete_purchases"
  on pronutro_purchases
  as restrictive
  for delete
  to authenticated
  using (
    exists (select 1 from pronutro_admins a where a.user_id = auth.uid())
  );
