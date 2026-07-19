alter table gisele_aplicacoes_faciais
  add column if not exists tipo text not null default 'ponto' check (tipo in ('ponto', 'risco')),
  add column if not exists pos_x2 numeric check (pos_x2 >= 0 and pos_x2 <= 100),
  add column if not exists pos_y2 numeric check (pos_y2 >= 0 and pos_y2 <= 100);
