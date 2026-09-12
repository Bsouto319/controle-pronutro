-- Decisão do Bruno (12/09): parar de pedir confirmação por botão do paciente
-- via WhatsApp (lembrete de dose e aviso de protocolo viram mensagem simples,
-- sem botão). O cron que checava a resposta já causou 2 bugs de causa raiz
-- diferente em poucos dias (leitura de botão/telefone, depois busca que não
-- escalava com o volume de mensagem da clínica) -- decisão foi eliminar o
-- fluxo inteiro em vez de remendar de novo.
select cron.unschedule('pronutro-check-dose-confirmations')
  where exists (select 1 from cron.job where jobname = 'pronutro-check-dose-confirmations');

select cron.unschedule('pronutro-check-protocol-confirmations')
  where exists (select 1 from cron.job where jobname = 'pronutro-check-protocol-confirmations');
