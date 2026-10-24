-- Console de despacho do painel: O.S. com a posição (ponto do evento ou local) para o mapa e a linha do tempo.
create view console_os with (security_invoker = true) as
select o.*,
  extensions.st_y(coalesce(o.evento_posicao, o.local)::extensions.geometry) as latitude,
  extensions.st_x(coalesce(o.evento_posicao, o.local)::extensions.geometry) as longitude
from ordens_servico o
where o.status <> 'cancelada';
