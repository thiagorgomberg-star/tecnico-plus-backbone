-- Separação das fusões por bandeja: as fusões da caixa (em ordem de fibra de entrada) ocupam as bandejas em sequência,
-- com "fusoes_por_bandeja" em cada uma. A foto de cada bandeja fica em os_anexos (tipo foto_bandeja, caixa_id, bandeja).
alter table caixas_emenda add column fusoes_por_bandeja integer not null default 12 check (fusoes_por_bandeja between 1 and 48);
alter table os_anexos add column bandeja integer check (bandeja > 0);

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
    'reflexao_db', f.reflexao_db, 'perda_db_km', f.perda_db_km) order by f.fibra)
    from caixa_fibras f where f.caixa_id = c.id), '[]'::jsonb) as fibras,
  c.tipo, c.os_id,
  c.fusoes_por_bandeja
from caixas_emenda c
join ordens_servico o on o.id = c.os_id
left join rotas r on r.id = o.rota_id
left join usuarios u on u.id = c.criada_por
left join caixas_emenda ant on ant.id = c.origem_caixa_id;
