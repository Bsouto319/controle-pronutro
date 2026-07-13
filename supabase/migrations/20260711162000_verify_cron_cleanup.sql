do $$
declare r record; cnt int := 0;
begin
  for r in select jobname, schedule, active from cron.job loop
    cnt := cnt + 1;
    raise notice 'REMAINING JOB: name=%, schedule=%, active=%', r.jobname, r.schedule, r.active;
  end loop;
  raise notice 'TOTAL: %', cnt;
end $$;
