-- Existiam DOIS agendamentos independentes chamando send-dose-reminder:
-- 1) cron do VPS (crontab root@31.97.240.160): 0 11 * * * (8h Brasilia)
-- 2) pg_cron job "pronutro-dose-reminder-daily": 0 12 * * * (9h Brasilia)
-- Isso mandava o lembrete duas vezes pro paciente (confirmado por Bruno:
-- Bruno Geronimo recebeu as 8h e as 9h). Mantemos so o cron do VPS, que
-- ja e' o mecanismo documentado/conhecido -- remove o job duplicado do pg_cron.
select cron.unschedule('pronutro-dose-reminder-daily');
