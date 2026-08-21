do $$
declare
  j record;
begin
  for j in select jobname, schedule, active, command from cron.job order by jobname loop
    raise notice 'CRON: name=% schedule=% active=% cmd=%', j.jobname, j.schedule, j.active, left(j.command, 200);
  end loop;
end $$;
