-- Corrige o no_show=true incorreto marcado no primeiro run (com bug) do check-no-show:
-- 22 pacientes ja tinham migrado pra um ciclo novo (Finalizar Protocolo) quando
-- foram erroneamente marcados como falta na semana de um ciclo antigo/obsoleto.
update pronutro_dose_records d
set no_show = false
from pronutro_patients p
where d.patient_id = p.id
  and d.no_show = true
  and d.retorno_verificado_em = '2026-08-21 20:33:39.225+00'
  and d.ciclo <> p.ciclo_atual;
