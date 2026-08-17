-- Agenda check-dose-confirmations (le resposta do botao de confirmacao, mesmo padrao
-- do check-protocol-confirmations) e check-no-show (detecta falta e avisa, 1x/dia).

select cron.unschedule('pronutro-check-dose-confirmations') where exists (
  select 1 from cron.job where jobname = 'pronutro-check-dose-confirmations'
);

select cron.schedule(
  'pronutro-check-dose-confirmations',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://iopdfbsndijehdqowfmj.supabase.co/functions/v1/check-dose-confirmations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvcGRmYnNuZGlqZWhkcW93Zm1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMjc5NjgsImV4cCI6MjA3NzYwMzk2OH0.5aoRsDS-WFeemjqnESeTyjvdt03abNsUyO-HJdgj3FE'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.unschedule('pronutro-check-no-show') where exists (
  select 1 from cron.job where jobname = 'pronutro-check-no-show'
);

-- 12:00 UTC = 09:00 em Brasilia
select cron.schedule(
  'pronutro-check-no-show',
  '0 12 * * *',
  $$
  select net.http_post(
    url := 'https://iopdfbsndijehdqowfmj.supabase.co/functions/v1/check-no-show',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvcGRmYnNuZGlqZWhkcW93Zm1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMjc5NjgsImV4cCI6MjA3NzYwMzk2OH0.5aoRsDS-WFeemjqnESeTyjvdt03abNsUyO-HJdgj3FE'
    ),
    body := '{}'::jsonb
  );
  $$
);
