do $$
declare
  r record;
begin
  raise notice '--- auth.users (id / email / created_at) ---';
  for r in select id, email, created_at from auth.users order by created_at loop
    raise notice '% | % | %', r.id, r.email, r.created_at;
  end loop;

  raise notice '--- gisele_patients count ---';
  for r in select count(*) as n from gisele_patients loop
    raise notice 'total: %', r.n;
  end loop;
end $$;
