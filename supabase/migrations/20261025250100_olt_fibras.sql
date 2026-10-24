-- DGO: fibra com cordão até uma OLT instalada no DGO: posição na OLT (ex.: OLT-01 · slot 2 · PON 5) e tipo de SFP.
-- A potência na saída da OLT usa potencia_tx_dbm.
alter table caixa_fibras add column cordao_olt boolean not null default false;
alter table caixa_fibras add column olt_posicao text;
alter table caixa_fibras add column sfp_tipo text;

create or replace view caixas_mapa with (security_invoker = true) as
select c.id, c.identificacao, c.capacidade_fibras, c.saidas, c.grupos_fusionados, c.grupos_vagos, c.observacao, c.endereco,
  c.localizada_em, c.precisao_m, c.atualizado_em,
  extensions.st_y(c.posicao::extensions.geometry) as latitude,
  extensions.st_x(c.posicao::extensions.geometry) as longitude,
  o.numero as os_numero, o.ticket_acionamento, r.trecho, u.nome as tecnico,
  coalesce((select jsonb_agg(jsonb_build_object('fibra_entrada', m.fibra_entrada, 'saida', m.saida, 'fibra_saida', m.fibra_saida, 'motivo', m.motivo) order by m.fibra_entrada)
    from caixa_manobras m where m.caixa_id = c.id), '[]'::jsonb) as manobras,
  c.origem_caixa_id, c.origem_saida, c.origem_dgo, ant.identificacao as origem_identificacao,
  coalesce((select jsonb_agg(jsonb_build_object('fibra', f.fibra, 'cliente', f.cliente, 'sem_potencia', f.sem_potencia, 'potencia_dbm', f.potencia_dbm,
    'reflexao_db', f.reflexao_db, 'perda_db_km', f.perda_db_km, 'posicao_dgo', f.posicao_dgo,
    'potencia_tx_dbm', f.potencia_tx_dbm, 'potencia_rx_dbm', f.potencia_rx_dbm,
    'cordao_olt', f.cordao_olt, 'olt_posicao', f.olt_posicao, 'sfp_tipo', f.sfp_tipo) order by f.fibra)
    from caixa_fibras f where f.caixa_id = c.id), '[]'::jsonb) as fibras,
  c.tipo, c.os_id,
  c.fusoes_por_bandeja,
  c.parceiro,
  c.instalacao,
  c.bastidor,
  c.padrao_cores_entrada,
  c.padrao_cores_saidas
from caixas_emenda c
join ordens_servico o on o.id = c.os_id
left join rotas r on r.id = o.rota_id
left join usuarios u on u.id = c.criada_por
left join caixas_emenda ant on ant.id = c.origem_caixa_id;
