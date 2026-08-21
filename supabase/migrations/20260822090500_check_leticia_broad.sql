do $$
declare
  p record;
begin
  for p in select id, nome, telefone, ativo from pronutro_patients where nome ilike '%leticia%' or nome ilike '%let%cia%' loop
    raise notice 'MATCH LETICIA: id=% nome=% telefone=% ativo=%', p.id, p.nome, p.telefone, p.ativo;
  end loop;
  for p in select id, nome, telefone, ativo from pronutro_patients where nome ilike '%frazen%' or nome ilike '%frasen%' or nome ilike '%frazao%' or nome ilike '%frazão%' loop
    raise notice 'MATCH FRAZEN: id=% nome=% telefone=% ativo=%', p.id, p.nome, p.telefone, p.ativo;
  end loop;
end $$;
