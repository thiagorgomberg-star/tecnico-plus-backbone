-- Rotas do backbone por trecho, com link do KMZ (Google Drive) para o técnico abrir no Google Earth.
create table rotas (
  id uuid primary key default gen_random_uuid(),
  trecho text not null,
  descricao text,
  link_kmz text not null,
  extensao_km numeric(8, 2),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table rotas enable row level security;

create policy rotas_ler on rotas for select to authenticated using (ativo or eh_supervisor());
create policy rotas_supervisor on rotas for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());

-- Eventos atendidos com o ponto marcado em campo: viram pins para atualizar o KMZ oficial.
create view eventos_mapa with (security_invoker = true) as
select
  o.id,
  o.numero,
  o.ticket_acionamento,
  o.tipo,
  o.titulo,
  o.status,
  o.endereco,
  o.evento_localizado_em,
  extensions.st_y(o.evento_posicao::extensions.geometry) as latitude,
  extensions.st_x(o.evento_posicao::extensions.geometry) as longitude,
  o.evento_precisao_m,
  u.nome as tecnico
from ordens_servico o
left join usuarios u on u.id = o.tecnico_id
where o.evento_posicao is not null;
