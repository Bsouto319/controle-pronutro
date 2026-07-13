-- Preenche quantidade_sessoes para a cliente de teste Gisele Falcão Costa,
-- que já tinha "Mesoterapia capilar 5 sessões Teste" como pacote mas nenhuma
-- quantidade estruturada (por isso o sistema mostrava 10 abas em vez de 5).
update gisele_patients
set quantidade_sessoes = 5
where id = '0802f443-64f2-42d6-910d-730cb6d3731e'
  and quantidade_sessoes is null;
