select cron.unschedule('pronutro-check-protocol-confirmations') where exists (
  select 1 from cron.job where jobname = 'pronutro-check-protocol-confirmations'
);

select cron.schedule(
  'pronutro-check-protocol-confirmations',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://iopdfbsndijehdqowfmj.supabase.co/functions/v1/check-protocol-confirmations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvcGRmYnNuZGlqZWhkcW93Zm1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMjc5NjgsImV4cCI6MjA3NzYwMzk2OH0.5aoRsDS-WFeemjqnESeTyjvdt03abNsUyO-HJdgj3FE'
    ),
    body := '{}'::jsonb
  );
  $$
);
