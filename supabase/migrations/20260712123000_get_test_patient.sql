do $$
declare r record;
begin
  select id, nome into r from pronutro_patients limit 1;
  raise notice 'TEST PATIENT: id=% nome=%', r.id, r.nome;
end $$;
