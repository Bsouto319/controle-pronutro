do $$
declare
  r record;
  total int := 0;
  bad_phone int := 0;
  not_thu_fri int := 0;
  inativos int := 0;
  dup_patient int := 0;
  prev_patient uuid := null;
begin
  for r in
    select d.patient_id, d.proxima_data_aplicacao, d.semana, p.nome, p.telefone, p.ativo,
           extract(dow from d.proxima_data_aplicacao) as dow
    from pronutro_dose_records d
    join pronutro_patients p on p.id = d.patient_id
    where d.proxima_data_aplicacao >= current_date
    order by d.proxima_data_aplicacao, p.nome
  loop
    total := total + 1;

    if r.ativo = false then
      inativos := inativos + 1;
      raise notice 'INATIVO (nao vai receber): % (data=%)', r.nome, r.proxima_data_aplicacao;
    end if;

    if length(regexp_replace(r.telefone, '\D', '', 'g')) not in (11, 13) then
      bad_phone := bad_phone + 1;
      raise notice 'TELEFONE RUIM: % -> "%" (data=%, semana=%)', r.nome, r.telefone, r.proxima_data_aplicacao, r.semana;
    end if;

    -- dow: 0=domingo, 4=quinta, 5=sexta
    if r.dow not in (4, 5) then
      not_thu_fri := not_thu_fri + 1;
      raise notice 'DATA FORA DO PADRAO (nao e quinta/sexta): % -> % (dow=%)', r.nome, r.proxima_data_aplicacao, r.dow;
    end if;
  end loop;

  raise notice '=== RESUMO ===';
  raise notice 'Total de retornos futuros: %', total;
  raise notice 'Inativos (nao devem receber): %', inativos;
  raise notice 'Telefones ruins (vao falhar): %', bad_phone;
  raise notice 'Datas fora de quinta/sexta: %', not_thu_fri;
end $$;
