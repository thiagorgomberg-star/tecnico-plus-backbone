-- Ponto da O.S. para o mapa do detalhe no painel: local do evento (técnico) ou, sem ele, o local de abertura.
create view os_local_mapa with (security_invoker = true) as
select o.id,
  extensions.st_y(coalesce(o.evento_posicao, o.local)::extensions.geometry) as latitude,
  extensions.st_x(coalesce(o.evento_posicao, o.local)::extensions.geometry) as longitude,
  o.evento_posicao is not null as do_evento
from ordens_servico o
where coalesce(o.evento_posicao, o.local) is not null;
grant select on os_local_mapa to authenticated;
