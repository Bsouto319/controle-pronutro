-- Sistema de papeis para o controle-gisele: Dra. Gisele = admin,
-- ela cadastra funcionarios (acesso normal, sem poder apagar cliente
-- nem desbloquear pacote travado pos-assinatura).
--
-- auth.users e compartilhado com o controle-pronutro (mesmo projeto Supabase),
-- entao esta tabela e o que realmente delimita "quem tem acesso ao app da Gisele"
-- e evita que a lista de usuarios de um app vaze pro outro.

create table if not exists gisele_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  nome text,
  role text not null default 'funcionario' check (role in ('admin', 'funcionario')),
  created_at timestamptz not null default now()
);

alter table gisele_users enable row level security;

drop policy if exists "self_check_gisele_users" on gisele_users;
create policy "self_check_gisele_users"
  on gisele_users
  for select
  to authenticated
  using (user_id = auth.uid());

-- Bruno ja tinha acesso total ao app (unico usuario ate agora, via login
-- compartilhado com o pronutro). Mantem ele como admin pra nao perder acesso
-- quando a trava de admin entrar em vigor.
insert into gisele_users (user_id, email, nome, role)
values ('d2698e0f-6dec-4af9-82bc-2c30881cd7ff', 'brunosouto1108@gmail.com', 'Bruno Souto', 'admin')
on conflict (user_id) do nothing;

-- Reforca no banco (nao so na UI) que apenas admins podem apagar clientes/sessoes.
drop policy if exists "only_admins_delete_gisele_patients" on gisele_patients;
create policy "only_admins_delete_gisele_patients"
  on gisele_patients
  as restrictive
  for delete
  to authenticated
  using (
    exists (select 1 from gisele_users g where g.user_id = auth.uid() and g.role = 'admin')
  );

drop policy if exists "only_admins_delete_gisele_sessoes" on gisele_sessoes;
create policy "only_admins_delete_gisele_sessoes"
  on gisele_sessoes
  as restrictive
  for delete
  to authenticated
  using (
    exists (select 1 from gisele_users g where g.user_id = auth.uid() and g.role = 'admin')
  );

-- Apenas admins podem alterar pacote_contratado/procedimento_contratado/quantidade_sessoes
-- depois que o cliente ja assinou (pacote_travado_em preenchido). Feito via trigger
-- (nao RLS with_check) porque precisamos comparar o valor ANTIGO com o NOVO.
create or replace function gisele_enforce_pacote_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.pacote_travado_em is not null
     and (
       new.pacote_contratado is distinct from old.pacote_contratado
       or new.procedimento_contratado is distinct from old.procedimento_contratado
       or new.quantidade_sessoes is distinct from old.quantidade_sessoes
     )
     and not exists (select 1 from gisele_users g where g.user_id = auth.uid() and g.role = 'admin')
  then
    raise exception 'Pacote travado apos assinatura do cliente. Apenas admin pode alterar.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gisele_enforce_pacote_lock on gisele_patients;
create trigger trg_gisele_enforce_pacote_lock
  before update on gisele_patients
  for each row
  execute function gisele_enforce_pacote_lock();
