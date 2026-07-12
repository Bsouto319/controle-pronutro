do $$
declare
  r record;
  cnt16 int := 0;
  cnt17 int := 0;
  sem_telefone int := 0;
begin
  for r in
    select d.proxima_data_aplicacao, d.semana, p.nome, p.telefone, p.ativo
    from pronutro_dose_records d
    join pronutro_patients p on p.id = d.patient_id
    where d.proxima_data_aplicacao in ('2026-07-16', '2026-07-17')
    order by d.proxima_data_aplicacao, p.nome
  loop
    if r.proxima_data_aplicacao = '2026-07-16' then cnt16 := cnt16 + 1; end if;
    if r.proxima_data_aplicacao = '2026-07-17' then cnt17 := cnt17 + 1; end if;
    if r.telefone is null or r.telefone = '' then
      sem_telefone := sem_telefone + 1;
      raise notice 'SEM TELEFONE: % (data=%, ativo=%)', r.nome, r.proxima_data_aplicacao, r.ativo;
    end if;
  end loop;
  raise notice 'TOTAL quinta 16/07: % pacientes', cnt16;
  raise notice 'TOTAL sexta 17/07: % pacientes', cnt17;
  raise notice 'SEM TELEFONE (vai falhar o envio): %', sem_telefone;
end $$;
