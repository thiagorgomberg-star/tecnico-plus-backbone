-- Base da aba Análise (BI do painel): uma linha por O.S. com posição do evento (ou do local) e tempos.
create view analise_os with (security_invoker = true) as
select
  o.id, o.numero, o.tipo, o.status, o.prioridade, o.titulo, o.ticket_acionamento,
  o.criado_em, o.iniciada_em, o.concluida_em, o.sla_limite,
  r.trecho,
  u.nome as tecnico, o.tecnico_id,
  extensions.st_y(coalesce(o.evento_posicao, o.local)::extensions.geometry) as latitude,
  extensions.st_x(coalesce(o.evento_posicao, o.local)::extensions.geometry) as longitude,
  (select count(*) from caixas_emenda c where c.os_id = o.id) as caixas
from ordens_servico o
left join rotas r on r.id = o.rota_id
left join usuarios u on u.id = o.tecnico_id
where o.status not in ('cancelada', 'rascunho');
