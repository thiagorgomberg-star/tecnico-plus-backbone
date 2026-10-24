-- Padrão de cores de cada cabo da caixa/DGO: entrada e cada saída (podem se misturar pelo caminho).
-- abnt = brasileiro, eia = americano, coroa = cabo coroa (288 FO).
alter table caixas_emenda add column padrao_cores_entrada text not null default 'abnt'
  check (padrao_cores_entrada in ('abnt', 'eia', 'coroa'));
alter table caixas_emenda add column padrao_cores_saidas text[]
  check (padrao_cores_saidas <@ array['abnt', 'eia', 'coroa']::text[]);

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
    'potencia_tx_dbm', f.potencia_tx_dbm, 'potencia_rx_dbm', f.potencia_rx_dbm) order by f.fibra)
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
