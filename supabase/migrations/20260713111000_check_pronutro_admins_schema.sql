do $$
declare
  r record;
begin
  raise notice '--- columns pronutro_admins ---';
  for r in
    select column_name, data_type from information_schema.columns
    where table_name = 'pronutro_admins' order by ordinal_position
  loop
    raise notice '% | %', r.column_name, r.data_type;
  end loop;

  raise notice '--- rls policies pronutro_admins ---';
  for r in select policyname, cmd, roles, qual, with_check from pg_policies where tablename = 'pronutro_admins' loop
    raise notice '% | % | % | qual=% | check=%', r.policyname, r.cmd, r.roles, r.qual, r.with_check;
  end loop;

  raise notice '--- rowsecurity pronutro_admins ---';
  for r in select relrowsecurity from pg_class where relname = 'pronutro_admins' loop
    raise notice 'rls_enabled: %', r.relrowsecurity;
  end loop;
end $$;
