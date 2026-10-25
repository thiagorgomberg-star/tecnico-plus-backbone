-- Vistoria Backbone MG: técnico abre a vistoria, registra postes/ocorrências e foto; outro técnico não mexe;
-- só o supervisor altera o planejamento. Linhas marcadas "deve falhar" precisam dar erro.
-- Rodar depois das migrações e do stub_auth.sql:
--   psql -d tecnico_teste -f supabase/tests/vistoria_mg.sql
\set ON_ERROR_STOP 0
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
-- o cadastro cria o perfil a partir destes campos do Supabase Auth
alter table auth.users add column if not exists email text, add column if not exists raw_user_meta_data jsonb;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'sup@mg'),('00000000-0000-0000-0000-0000000000a2', 'tec@mg'),('00000000-0000-0000-0000-0000000000a3', 'outro@mg');
insert into usuarios (id,nome,papel) values ('00000000-0000-0000-0000-0000000000a1','Sup MG','supervisor'),
  ('00000000-0000-0000-0000-0000000000a2','Tec MG','tecnico'),('00000000-0000-0000-0000-0000000000a3','Outro Tec','tecnico')
  on conflict (id) do update set nome = excluded.nome, papel = excluded.papel;
set role authenticated;

-- técnico abre a vistoria em campo
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
insert into ordens_servico (id, tipo, status, titulo, tecnico_id, criada_por)
  values ('00000000-0000-0000-0000-00000000f001', 'Vistoria Backbone MG', 'em_execucao', 'BB-13 · Lambari × Heliodora × Careaçu',
          auth.uid(), auth.uid());
insert into vistoria_pontos (id, os_id, categoria, identificacao, posicao, localizada_em, material, estado_base, inclinado, estai, precisa_troca, tipo_via, via_nome)
  values ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000f001', 'poste', 'P-001',
          'SRID=4326;POINT(-45.6986 -22.0590)', now(), 'madeira', 'podre', true, 'frouxo', true, 'rodovia_federal', 'BR-381 km 812');
insert into vistoria_pontos (os_id, categoria, posicao, localizada_em, ocorrencia, gravidade)
  values ('00000000-0000-0000-0000-00000000f001', 'ocorrencia', 'SRID=4326;POINT(-45.6987 -22.0572)', now(), 'travessia', 'alta');
insert into vistoria_pontos (os_id, categoria) values ('00000000-0000-0000-0000-00000000f001', 'ocorrencia'); -- deve falhar (sem tipo de ocorrência)
insert into os_anexos (os_id, tipo, caminho_arquivo, ponto_id)
  values ('00000000-0000-0000-0000-00000000f001', 'foto_ponto', 'p1.jpg', '00000000-0000-0000-0000-00000000e001');
update vistoria_pontos set estado_base = 'cupim' where id = '00000000-0000-0000-0000-00000000e001';
update vistoria_planejamento set status = 'concluido'; -- não altera nada (técnico só lê)
select 'tec planejamento concluido', count(*) from vistoria_planejamento where status = 'concluido';

-- outro técnico não lança ponto na vistoria de outro
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
insert into vistoria_pontos (os_id, categoria) values ('00000000-0000-0000-0000-00000000f001', 'poste'); -- deve falhar

-- supervisor vê a produção e atualiza o andamento
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select 'mapa', categoria, identificacao, estado_base, precisa_troca, tipo_via, round(latitude::numeric, 4), tecnico, os_titulo from vistoria_pontos_mapa order by categoria;
select 'foto do poste', count(*) from os_anexos where ponto_id is not null;
update vistoria_planejamento set status = 'concluido', observacao = 'ok' where data = '2026-11-09';
select 'sup planejamento concluido', count(*) from vistoria_planejamento where status = 'concluido';
