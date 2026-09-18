-- A migracao anterior (medicos_cadastro) criou 1 registro por VALOR DE TEXTO
-- distinto ja digitado -- como o texto era livre, o mesmo medico tinha varias
-- grafias diferentes (espaco duplo, maiuscula/minuscula, com/sem ponto,
-- Dr/Dra trocado por erro de digitacao). Consolida em 1 registro canonico por
-- pessoa, repontando pacientes e pagamentos antes de apagar os duplicados.
--
-- NAO mesclado (ambiguo, precisa confirmacao humana): "Dra. Augusto Margon"
-- tem sobrenome extra, pode ser pessoa diferente de "Augusto" -- deixado
-- separado de proposito.

do $$
declare
  canon uuid;
  dup uuid;
begin
  -- Augusto -> "Dr. Augusto"
  select id into canon from pronutro_medicos where nome = 'Dr. Augusto';
  if canon is not null then
    for dup in select id from pronutro_medicos where nome in ('Dr  Augusto', 'Dr augusto', 'Dr Augusto') loop
      update pronutro_patients set medico_id = canon, medico_prescritor = 'Dr. Augusto' where medico_id = dup;
      update pronutro_pagamentos set medico_id = canon where medico_id = dup;
      delete from pronutro_medicos where id = dup;
    end loop;
  end if;

  -- Celso -> "Dr. Celso"
  select id into canon from pronutro_medicos where nome = 'Dr. Celso';
  if canon is not null then
    for dup in select id from pronutro_medicos where nome in ('Dr Celso', 'Dra. Celso') loop
      update pronutro_patients set medico_id = canon, medico_prescritor = 'Dr. Celso' where medico_id = dup;
      update pronutro_pagamentos set medico_id = canon where medico_id = dup;
      delete from pronutro_medicos where id = dup;
    end loop;
  end if;

  -- Marcus -> "Dr. Marcus"
  select id into canon from pronutro_medicos where nome = 'Dr. Marcus';
  if canon is not null then
    for dup in select id from pronutro_medicos where nome in ('Dr Marcus') loop
      update pronutro_patients set medico_id = canon, medico_prescritor = 'Dr. Marcus' where medico_id = dup;
      update pronutro_pagamentos set medico_id = canon where medico_id = dup;
      delete from pronutro_medicos where id = dup;
    end loop;
  end if;

  -- Kelly -> "Dra. Kelly"
  select id into canon from pronutro_medicos where nome = 'Dra. Kelly';
  if canon is not null then
    for dup in select id from pronutro_medicos where nome in ('Dr. Kelly', 'Dra Kelly') loop
      update pronutro_patients set medico_id = canon, medico_prescritor = 'Dra. Kelly' where medico_id = dup;
      update pronutro_pagamentos set medico_id = canon where medico_id = dup;
      delete from pronutro_medicos where id = dup;
    end loop;
  end if;

  -- Vanessa -> "Dra. Vanessa"
  select id into canon from pronutro_medicos where nome = 'Dra. Vanessa';
  if canon is not null then
    for dup in select id from pronutro_medicos where nome in ('Dra Vanessa') loop
      update pronutro_patients set medico_id = canon, medico_prescritor = 'Dra. Vanessa' where medico_id = dup;
      update pronutro_pagamentos set medico_id = canon where medico_id = dup;
      delete from pronutro_medicos where id = dup;
    end loop;
  end if;
end $$;
