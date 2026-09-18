-- Bug real: totalComprado/saldo (Paciente.tsx) e o estoque geral da clinica
-- (Estoque.tsx) somavam quantidade_mg de TODAS as compras de um paciente/
-- da clinica, sem filtrar por medicamento_id -- misturando mg de Tirzepatida
-- com unidade de Vitamina D (ou qualquer outro medicamento) no mesmo saldo.
--
-- Pior: ao aplicar uma dose, o desconto de estoque usava
-- `purchases.find(p => p.medicamento_id)` -- a PRIMEIRA compra do paciente
-- com qualquer medicamento_id preenchido, nao necessariamente a Tirzepatida
-- -- podendo debitar o estoque do medicamento errado.
--
-- Causa raiz: pronutro_medicamentos foi criado em 28/07 só com "Tirzepatida"
-- (unica medicacao que existia ate entao -- ver 20260728120000_medicamentos.sql,
-- que ja fez UPDATE em todas as compras antigas pra apontar pra ela). O
-- ciclo/semana/dose_mg (pronutro_dose_records) sempre foi, na pratica, o
-- protocolo semanal de Tirzepatida -- nunca existiu "dose" de outro
-- medicamento nesse fluxo. Por isso a correcao e identificar explicitamente
-- QUAL medicamento e o "principal" (o do protocolo semanal), em vez de
-- inferir errado pela ordem do array de compras.

alter table pronutro_medicamentos add column if not exists is_principal boolean not null default false;
alter table pronutro_medicamentos add column if not exists estoque_minimo numeric(10,2);

-- Marca Tirzepatida como principal (e a unica que existia antes de hoje em
-- praticamente toda instalacao deste sistema).
update pronutro_medicamentos set is_principal = true where nome = 'Tirzepatida';

-- Garante que existe exatamente 1 principal quando ha pelo menos 1 medicamento
-- cadastrado e nenhum foi marcado (instalacao onde o nome nao e "Tirzepatida"
-- literal) -- pega o mais antigo como fallback, pra nunca ficar sem principal
-- definido e voltar a cair no bug de "primeira compra que aparecer".
update pronutro_medicamentos m
set is_principal = true
where not exists (select 1 from pronutro_medicamentos where is_principal = true)
  and m.id = (select id from pronutro_medicamentos order by created_at asc limit 1);

comment on column pronutro_medicamentos.is_principal is
  'Medicamento do protocolo semanal (ciclo/semana/dose_mg em pronutro_dose_records). So deve haver 1 true por clinica -- usado pra saber contra qual medicamento comparar/descontar dose aplicada, em vez de adivinhar pela ordem das compras.';
comment on column pronutro_medicamentos.estoque_minimo is
  'Limite de alerta de estoque baixo especifico deste medicamento (mg/unidade conforme o proprio medicamento). Null = usa o alerta global antigo (pronutro_config.estoque_alerta_mg) como fallback, so pro principal.';
