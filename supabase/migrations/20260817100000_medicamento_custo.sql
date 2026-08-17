-- Custo por mg de cada medicacao, pra calcular margem real no dashboard financeiro
-- (receita lancada - custo do mg vendido). Opcional: fica null ate a clinica preencher.

alter table pronutro_medicamentos
  add column if not exists custo_mg numeric;
