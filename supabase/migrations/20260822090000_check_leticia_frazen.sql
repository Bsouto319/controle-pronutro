do $$
declare
  p record;
  d record;
  hoje date := current_date;
begin
  for p in select * from pronutro_patients where nome ilike '%leticia%frazen%' or nome ilike '%let%cia%frazen%' loop
    raise notice 'PACIENTE: id=% nome=% telefone=% ativo=% ciclo_atual=%', p.id, p.nome, p.telefone, p.ativo, p.ciclo_atual;

    for d in select * from pronutro_dose_records where patient_id = p.id order by ciclo, semana loop
      raise notice '  DOSE: ciclo=% semana=% dose_mg=% data_aplicacao=% proxima_data_aplicacao=% retorno_status=% retorno_enviado_em=% no_show=%',
        d.ciclo, d.semana, d.dose_mg, d.data_aplicacao, d.proxima_data_aplicacao, d.retorno_confirmacao_status, d.retorno_confirmacao_enviado_em, d.no_show;
    end loop;
  end loop;

  raise notice '=== HOJE: % ===', hoje;
end $$;
