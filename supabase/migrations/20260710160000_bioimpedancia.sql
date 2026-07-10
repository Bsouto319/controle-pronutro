-- Tabela de exames de bioimpedancia (InBody) por paciente
create table if not exists pronutro_bioimpedancia (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references pronutro_patients(id) on delete cascade,
  data_exame date not null,
  arquivo_url text not null,
  observacoes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_bioimpedancia_patient on pronutro_bioimpedancia(patient_id);

alter table pronutro_bioimpedancia enable row level security;

drop policy if exists "auth_all_bioimpedancia" on pronutro_bioimpedancia;
create policy "auth_all_bioimpedancia"
  on pronutro_bioimpedancia
  for all
  to authenticated
  using (true)
  with check (true);

-- Bucket de storage pros arquivos (PDF/foto do relatorio InBody), mesmo padrao do bucket "receitas"
insert into storage.buckets (id, name, public)
values ('bioimpedancia', 'bioimpedancia', true)
on conflict (id) do nothing;

drop policy if exists "auth_insert_bioimpedancia" on storage.objects;
create policy "auth_insert_bioimpedancia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bioimpedancia');

drop policy if exists "auth_select_bioimpedancia" on storage.objects;
create policy "auth_select_bioimpedancia" on storage.objects
  for select to authenticated
  using (bucket_id = 'bioimpedancia');

drop policy if exists "auth_delete_bioimpedancia" on storage.objects;
create policy "auth_delete_bioimpedancia" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bioimpedancia');
