-- Faltou na consolidacao anterior: "Dra. Augusto" (mesmo padrao de erro de
-- prefixo Dr/Dra ja visto em Celso/Kelly) e a mesma pessoa que "Dr. Augusto".
do $$
declare
  canon uuid;
  dup uuid;
begin
  select id into canon from pronutro_medicos where nome = 'Dr. Augusto';
  if canon is not null then
    for dup in select id from pronutro_medicos where nome = 'Dra. Augusto' loop
      update pronutro_patients set medico_id = canon, medico_prescritor = 'Dr. Augusto' where medico_id = dup;
      update pronutro_pagamentos set medico_id = canon where medico_id = dup;
      delete from pronutro_medicos where id = dup;
    end loop;
  end if;
end $$;
