-- Pontos de GPS do dia (fuso de São Paulo) com latitude/longitude, para o mapa do painel.
create view trajeto_do_dia with (security_invoker = true) as
select
  p.tecnico_id,
  p.expediente_id,
  p.registrado_em,
  extensions.st_y(p.posicao::extensions.geometry) as latitude,
  extensions.st_x(p.posicao::extensions.geometry) as longitude,
  p.precisao_m,
  p.velocidade_kmh
from posicoes_gps p
where p.registrado_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
