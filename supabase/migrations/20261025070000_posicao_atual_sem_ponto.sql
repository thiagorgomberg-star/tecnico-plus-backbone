-- Técnico com expediente aberto aparece na lista do painel mesmo antes do primeiro ponto de GPS.
create or replace view posicao_atual_tecnicos with (security_invoker = true) as
select
  e.tecnico_id,
  u.nome,
  e.id as expediente_id,
  coalesce(p.registrado_em, e.inicio) as registrado_em,
  extensions.st_y(p.posicao::extensions.geometry) as latitude,
  extensions.st_x(p.posicao::extensions.geometry) as longitude,
  p.velocidade_kmh,
  p.bateria_pct
from expedientes e
join usuarios u on u.id = e.tecnico_id
left join lateral (
  select * from posicoes_gps g
   where g.expediente_id = e.id
   order by g.registrado_em desc
   limit 1
) p on true
where e.fim is null;
