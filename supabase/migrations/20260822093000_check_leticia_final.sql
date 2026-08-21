do $$
declare
  d record;
begin
  for d in select * from pronutro_dose_records where patient_id = 'c03531ed-b1e6-4800-971c-ba37ff67ef3d' order by ciclo, semana loop
    raise notice 'DOSE: ciclo=% semana=% data_aplicacao=% proxima_data_aplicacao=% retorno_status=% retorno_enviado_em=% no_show=% retorno_verificado_em=%',
      d.ciclo, d.semana, d.data_aplicacao, d.proxima_data_aplicacao, d.retorno_confirmacao_status, d.retorno_confirmacao_enviado_em, d.no_show, d.retorno_verificado_em;
  end loop;
end $$;
