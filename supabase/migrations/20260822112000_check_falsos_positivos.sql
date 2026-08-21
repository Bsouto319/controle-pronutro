do $$
declare
  r record;
  total int := 0;
begin
  for r in
    select d.id, p.nome, p.telefone, d.ciclo as ciclo_da_mensagem, p.ciclo_atual, d.proxima_data_aplicacao
    from pronutro_dose_records d
    join pronutro_patients p on p.id = d.patient_id
    where d.no_show = true
      and d.retorno_verificado_em = '2026-08-21 20:33:39.225+00'
      and d.ciclo <> p.ciclo_atual
    order by p.nome
  loop
    total := total + 1;
    raise notice 'FALSO POSITIVO: nome=% telefone=% ciclo_da_mensagem=% ciclo_atual=% data_perdida=%',
      r.nome, r.telefone, r.ciclo_da_mensagem, r.ciclo_atual, r.proxima_data_aplicacao;
  end loop;
  raise notice 'TOTAL FALSOS POSITIVOS: %', total;
end $$;
