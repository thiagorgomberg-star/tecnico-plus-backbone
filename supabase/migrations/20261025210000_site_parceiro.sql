-- Novo tipo de ponto: site de parceiro (onde a fibra é entregue ao cliente/parceiro), com o nome do parceiro.
-- É uma ponta, como o DGO: mede sinal/OTDR. TAG automática SITE-BKB-0001.
alter table caixas_emenda drop constraint caixas_emenda_tipo_check;
alter table caixas_emenda add constraint caixas_emenda_tipo_check check (tipo in ('emenda', 'entroncamento', 'dgo', 'site'));
alter table caixas_emenda add column parceiro text;

create or replace function prefixo_tag_caixa(p_tipo text) returns text
language sql immutable set search_path = public as $$
  select case p_tipo when 'entroncamento' then 'ENT-BKB-' when 'dgo' then 'DGO-BKB-' when 'site' then 'SITE-BKB-' else 'CE-BKB-' end
$$;

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
  c.fusoes_por_bandeja,
  c.parceiro
from caixas_emenda c
join ordens_servico o on o.id = c.os_id
left join rotas r on r.id = o.rota_id
left join usuarios u on u.id = c.criada_por
left join caixas_emenda ant on ant.id = c.origem_caixa_id;
