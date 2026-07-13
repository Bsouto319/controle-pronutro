insert into pronutro_bioimpedancia (id, patient_id, data_exame, arquivo_url, observacoes)
values ('00000000-0000-0000-0000-000000000001', 'd5898a91-3559-4de6-b67b-2f9558496205', '2026-07-12', 'https://apresentacao-btech.vercel.app/poster2.jpg', 'TESTE TEMPORARIO - remover depois')
on conflict (id) do update set arquivo_url = excluded.arquivo_url;
