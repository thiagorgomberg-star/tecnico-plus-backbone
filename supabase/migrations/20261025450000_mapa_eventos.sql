-- Mapa de calor do painel: eventos capturados em campo além das O.S. (eventos informados pelos técnicos,
-- inclusive os que ainda estão no backlog, e ocorrências/postes condenados da vistoria).
create or replace view mapa_eventos with (security_invoker = true) as
select 'informado'::text as fonte, o.id, o.titulo as descricao, o.prioridade::text as gravidade, o.criado_em,
       u.nome as tecnico, o.status::text as situacao, o.numero as os_numero,
       extensions.st_y(o.local::extensions.geometry) as latitude, extensions.st_x(o.local::extensions.geometry) as longitude
  from ordens_servico o
  left join usuarios u on u.id = o.informado_por
 where o.tipo = 'Evento informado' and o.status <> 'cancelada' and o.local is not null
union all
select 'vistoria', p.id,
       case when p.categoria = 'poste' then 'Poste ' || coalesce(p.identificacao, '') || ' a trocar' else coalesce(p.ocorrencia, 'ocorrência') end,
       coalesce(p.gravidade, case when p.precisa_troca then 'alta' else 'media' end), p.criado_em,
       u.nome, case when p.os_gerada_id is not null then 'gerou O.S.' else 'anotado' end, o.numero,
       extensions.st_y(p.posicao::extensions.geometry), extensions.st_x(p.posicao::extensions.geometry)
  from vistoria_pontos p
  join ordens_servico o on o.id = p.os_id
  left join usuarios u on u.id = p.criada_por
 where p.posicao is not null and (p.categoria = 'ocorrencia' or p.precisa_troca or p.gerar_os);
