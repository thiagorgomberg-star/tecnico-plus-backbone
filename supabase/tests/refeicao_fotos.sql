-- Refeição pausa a O.S., mínimo de 10 fotos na horizontal, visão semanal e hora offline.
-- Rodar depois de fluxo_mvp.sql. Linhas marcadas "deve falhar" precisam dar erro.
\set ON_ERROR_STOP 0
reset role;
grant all on refeicoes to authenticated;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into ordens_servico (tipo,titulo,tecnico_id,status) values ('Corretiva','Rompimento km 30','00000000-0000-0000-0000-000000000002','enviada');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
insert into expedientes (km_inicial) values (2000);
update ordens_servico set status='aceita', aceita_em = now() - interval '3 hours' where numero=2;
select 'aceita_em nunca antes do envio', aceita_em >= enviada_em from ordens_servico where numero=2;
update ordens_servico set status='em_execucao' where numero=2;
update ordens_servico set evento_localizado_em = now() - interval '1 hour', evento_posicao = 'SRID=4326;POINT(-46.1 -23.1)' where numero=2;
select 'refeicao', os_pausada_id is not null from iniciar_refeicao();
select 'status durante refeicao', status from ordens_servico where numero=2;
select iniciar_refeicao(); -- deve falhar (já tem refeição aberta)
select 'fim refeicao', fim is not null from encerrar_refeicao();
select 'status apos refeicao', status from ordens_servico where numero=2;
update ordens_servico set status='concluida' where numero=2; -- deve falhar (sem fotos)
insert into os_anexos (os_id,tipo,caminho_arquivo,largura_px,altura_px) select id,'foto_antes','x.jpg',1080,1920 from ordens_servico where numero=2; -- deve falhar (vertical)
insert into os_anexos (os_id,tipo,caminho_arquivo,largura_px,altura_px) select id,'foto_antes','f'||g||'.jpg',1920,1080 from ordens_servico, generate_series(1,10) g where numero=2;
update ordens_servico set status='concluida' where numero=2;
select 'historico 2', string_agg(status_novo::text, ' > ' order by e.criado_em, e.id) from os_eventos e join ordens_servico o on o.id=e.os_id where o.numero=2;
-- visão semanal: O.S. baixada há 8 dias some para o técnico
reset role;
update ordens_servico set atualizado_em = now() - interval '8 days' where numero=1;
alter table ordens_servico disable trigger ordens_servico_datas_trg;
update ordens_servico set atualizado_em = now() - interval '8 days' where numero=1;
alter table ordens_servico enable trigger ordens_servico_datas_trg;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select 'tecnico ve (esperado 1)', count(*) from ordens_servico;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select 'supervisor ve (esperado 2)', count(*) from ordens_servico;
