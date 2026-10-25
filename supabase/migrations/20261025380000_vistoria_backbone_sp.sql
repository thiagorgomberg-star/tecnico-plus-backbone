-- Vistoria Backbone SP (SJC, Taubaté, São Paulo): mesmos registros da vistoria de Minas.
-- Cada poste/ocorrência diz se o trecho é licenciado ou sem licenciamento.

alter policy os_tecnico_abre_preventiva on ordens_servico
  with check (
    tecnico_id = auth.uid()
    and criada_por = auth.uid()
    and tipo in ('Preventiva rede', 'Preventiva site', 'Vistoria Backbone MG', 'Vistoria Backbone SP')
    and status = 'em_execucao'
  );

alter table atividades_preventiva drop constraint if exists atividades_preventiva_tipo_check;
alter table atividades_preventiva add constraint atividades_preventiva_tipo_check
  check (tipo in ('Preventiva rede', 'Preventiva site', 'Vistoria Backbone MG', 'Vistoria Backbone SP'));

insert into atividades_preventiva (tipo, nome, ordem) values
  ('Vistoria Backbone SP', 'Registro de postes (estado da base, inclinação, estai)', 1),
  ('Vistoria Backbone SP', 'Identificação do tipo de via (rodovia, vicinal, urbana)', 2),
  ('Vistoria Backbone SP', 'Trecho licenciado ou sem licenciamento', 3),
  ('Vistoria Backbone SP', 'Cadastro das caixas com TAG, fotos e GPS', 4),
  ('Vistoria Backbone SP', 'Abertura das caixas-chave e ocupação das fibras', 5),
  ('Vistoria Backbone SP', 'Medição OTDR a partir do POP', 6),
  ('Vistoria Backbone SP', 'Cabo exposto, flecha baixa e travessias', 7),
  ('Vistoria Backbone SP', 'Reserva técnica', 8),
  ('Vistoria Backbone SP', 'Vegetação / poda', 9)
on conflict (tipo, nome) do nothing;

alter table vistoria_pontos add column if not exists licenciamento text
  check (licenciamento in ('licenciado', 'sem_licenca'));

-- Planejamento separado por região (o que já existe é de Minas).
alter table vistoria_planejamento add column if not exists regiao text not null default 'MG'
  check (regiao in ('MG', 'SP'));

create or replace view vistoria_pontos_mapa with (security_invoker = true) as
select p.id, p.os_id, p.categoria, p.identificacao, p.endereco, p.precisao_m, p.localizada_em,
       p.material, p.estado_base, p.inclinado, p.rachado, p.estai, p.precisa_troca, p.tipo_via, p.via_nome,
       p.ocorrencia, p.gravidade, p.observacao, p.criado_em, p.atualizado_em,
       extensions.st_y(p.posicao::extensions.geometry) as latitude,
       extensions.st_x(p.posicao::extensions.geometry) as longitude,
       o.numero as os_numero, o.titulo as os_titulo, o.tecnico_id, u.nome as tecnico,
       p.licenciamento, o.tipo as os_tipo
  from vistoria_pontos p
  join ordens_servico o on o.id = p.os_id
  left join usuarios u on u.id = o.tecnico_id;
