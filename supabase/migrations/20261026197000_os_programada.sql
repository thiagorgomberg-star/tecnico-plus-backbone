-- Linha do tempo do Console de despacho: o supervisor arrasta a O.S. para programar o horário de início e fim.
alter table ordens_servico add column programada_inicio timestamptz, add column programada_fim timestamptz;

-- console_os foi criada com o.* da época (colunas fixas); esta versão traz todas as colunas atuais.
create view console_despacho_os with (security_invoker = true) as
select o.*,
  extensions.st_y(coalesce(o.evento_posicao, o.local)::extensions.geometry) as latitude,
  extensions.st_x(coalesce(o.evento_posicao, o.local)::extensions.geometry) as longitude
from ordens_servico o
where o.status <> 'cancelada';
grant select on console_despacho_os to authenticated;
