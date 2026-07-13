alter table pronutro_bioimpedancia
  add column if not exists analise_gpt text,
  add column if not exists analise_gerada_em timestamptz;
