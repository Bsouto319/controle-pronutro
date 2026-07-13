do $$
declare
  r record;
  cnt int := 0;
begin
  for r in select jobname, schedule, active, command from cron.job loop
    cnt := cnt + 1;
    raise notice 'CRON JOB: name=%, schedule=%, active=%, cmd=%', r.jobname, r.schedule, r.active, r.command;
  end loop;
  raise notice 'TOTAL JOBS: %', cnt;
end $$;
