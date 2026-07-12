do $$
declare
  r record;
  bad int := 0;
begin
  for r in
    select p.nome, p.telefone, d.proxima_data_aplicacao
    from pronutro_dose_records d
    join pronutro_patients p on p.id = d.patient_id
    where d.proxima_data_aplicacao in ('2026-07-16', '2026-07-17')
  loop
    if length(regexp_replace(r.telefone, '\D', '', 'g')) not in (11, 13) then
      bad := bad + 1;
      raise notice 'TELEFONE SUSPEITO: % -> "%" (data=%)', r.nome, r.telefone, r.proxima_data_aplicacao;
    end if;
  end loop;
  raise notice 'TOTAL TELEFONES SUSPEITOS: %', bad;
end $$;
