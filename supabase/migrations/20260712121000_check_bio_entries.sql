do $$
declare r record;
begin
  for r in select id, patient_id, data_exame, arquivo_url from pronutro_bioimpedancia loop
    raise notice 'BIO: id=% patient=% data=% url=%', r.id, r.patient_id, r.data_exame, r.arquivo_url;
  end loop;
end $$;
