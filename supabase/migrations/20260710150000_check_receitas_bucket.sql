do $$
declare r record;
begin
  for r in select id, name, public from storage.buckets loop
    raise notice 'BUCKET: id=% name=% public=%', r.id, r.name, r.public;
  end loop;
  for r in select policyname, cmd, qual, with_check from pg_policies where schemaname='storage' and tablename='objects' loop
    raise notice 'STORAGE POLICY: name=% cmd=% qual=% check=%', r.policyname, r.cmd, r.qual, r.with_check;
  end loop;
end $$;
