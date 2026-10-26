-- Reservas de cabo encontradas no caminho desde o ponto anterior (guardadas no ponto seguinte):
-- [{metros, marca, lat, lng, obs}]. A view caixas_mapa ganhou reservas_lance no fim (mesma definição de 20261026060000 + a coluna).
alter table caixas_emenda add column if not exists reservas_lance jsonb;

-- Vistoria de rota: marca de metragem do cabo e reserva encontrada em cada poste/ponto (ajuda a localizar rompimento).
alter table vistoria_pontos add column if not exists metragem_cabo numeric check (metragem_cabo is null or metragem_cabo >= 0);
alter table vistoria_pontos add column if not exists reserva_m numeric check (reserva_m is null or reserva_m >= 0);

create or replace view vistoria_pontos_mapa with (security_invoker = true) as
select p.id, p.os_id, p.categoria, p.identificacao, p.endereco, p.precisao_m, p.localizada_em,
       p.material, p.estado_base, p.inclinado, p.rachado, p.estai, p.precisa_troca, p.tipo_via, p.via_nome,
       p.ocorrencia, p.gravidade, p.observacao, p.criado_em, p.atualizado_em,
       extensions.st_y(p.posicao::extensions.geometry) as latitude,
       extensions.st_x(p.posicao::extensions.geometry) as longitude,
       o.numero as os_numero, o.titulo as os_titulo, o.tecnico_id, u.nome as tecnico,
       p.licenciamento, o.tipo as os_tipo,
       p.gerar_os, p.os_gerada_id, g.numero as os_gerada_numero, g.status as os_gerada_status,
       p.metragem_cabo, p.reserva_m
  from vistoria_pontos p
  join ordens_servico o on o.id = p.os_id
  left join usuarios u on u.id = o.tecnico_id
  left join ordens_servico g on g.id = p.os_gerada_id;
