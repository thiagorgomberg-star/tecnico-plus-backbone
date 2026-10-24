-- Fluxo do MVP: supervisor envia O.S., técnico executa, expediente com GPS.
-- Linhas marcadas "deve falhar" precisam dar erro.
\set ON_ERROR_STOP 0
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into usuarios (id,nome,papel) values ('00000000-0000-0000-0000-000000000001','Sup','supervisor'),('00000000-0000-0000-0000-000000000002','Tec','tecnico'),('00000000-0000-0000-0000-000000000003','Tec2','tecnico');
set role authenticated;
-- supervisor cria e envia
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into ordens_servico (tipo,titulo,tecnico_id) values ('corretiva','Rompimento km 12','00000000-0000-0000-0000-000000000002');
update ordens_servico set status='enviada' where numero=1;
-- tecnico 2 ve? tecnico 3 nao
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select 'tec3 ve', count(*) from ordens_servico;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select 'tec ve', count(*) from ordens_servico;
select 'alertas tec', mensagem from alertas;
update ordens_servico set status='baixada' where numero=1; -- deve falhar
update ordens_servico set status='aceita' where numero=1;
update ordens_servico set status='em_execucao' where numero=1;
update ordens_servico set status='concluida' where numero=1;
update usuarios set papel='admin' where id=auth.uid(); -- deve falhar
update usuarios set push_token='abc' where id=auth.uid();
-- expediente
insert into expedientes (km_inicial) values (1000);
insert into expedientes (km_inicial) values (1000); -- deve falhar (ja aberto)
insert into posicoes_gps (expediente_id, registrado_em, posicao) select id, now(), 'SRID=4326;POINT(-46.0 -23.0)' from expedientes;
insert into posicoes_gps (expediente_id, registrado_em, posicao) select id, now()+interval '1 min', 'SRID=4326;POINT(-46.0 -23.01)' from expedientes;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select 'mapa', nome, latitude, longitude from posicao_atual_tecnicos;
update ordens_servico set status='baixada' where numero=1;
select 'historico', status_anterior, status_novo from os_eventos order by id;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
update expedientes set fim=now()+interval '2 min', km_final=1001;
select 'km gps', distancia_gps_km from expedientes;
