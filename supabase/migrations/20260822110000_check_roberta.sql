do $$
declare
  p record;
  d record;
begin
  for p in select id, nome, telefone, ciclo_atual from pronutro_patients where nome ilike '%roberta%sim%carvalho%cesar%' loop
    raise notice 'PACIENTE: id=% nome=% ciclo_atual=%', p.id, p.nome, p.ciclo_atual;
    for d in select * from pronutro_dose_records where patient_id = p.id order by ciclo, semana loop
      raise notice '  DOSE: ciclo=% semana=% data_aplicacao=% proxima_data_aplicacao=% no_show=% retorno_verificado_em=% created_at=% updated_at=%',
        d.ciclo, d.semana, d.data_aplicacao, d.proxima_data_aplicacao, d.no_show, d.retorno_verificado_em, d.created_at, d.updated_at;
    end loop;
  end loop;
  raise notice 'HOJE = %, AGORA = %', current_date, now();
end $$;
