-- Caixas de emenda cadastradas em campo: localização, fotos, plano de fusão e manobras de fibra.
-- Viram pins no KMZ das caixas (painel) e entram no relatório da O.S.

create table caixas_emenda (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references ordens_servico (id) on delete cascade,
  identificacao text not null,
  posicao extensions.geography(point, 4326),
  precisao_m real,
  localizada_em timestamptz,
  endereco text,
  -- Plano de fusão: cabo de entrada e cabos de saída (fibras de cada um). Por padrão a fusão é cor com cor;
  -- as fibras de entrada além do total das saídas param nesta caixa. As exceções ficam em caixa_manobras.
  capacidade_fibras integer not null check (capacidade_fibras in (6, 12, 24, 36, 48, 72, 96, 144, 288)),
  saidas integer[] not null default '{}' check (array_position(saidas, null) is null),
  grupos_fusionados integer not null default 0 check (grupos_fusionados >= 0),
  grupos_vagos integer not null default 0 check (grupos_vagos >= 0),
  observacao text,
  criada_por uuid not null references usuarios (id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index caixas_emenda_os_idx on caixas_emenda (os_id);

create table caixa_manobras (
  id uuid primary key default gen_random_uuid(),
  caixa_id uuid not null references caixas_emenda (id) on delete cascade,
  fibra_entrada integer not null check (fibra_entrada > 0),
  saida integer not null default 1 check (saida > 0),       -- número do cabo de saída (1 = Saída 1)
  fibra_saida integer not null check (fibra_saida > 0),
  motivo text,
  criada_por uuid not null references usuarios (id) default auth.uid(),
  criado_em timestamptz not null default now()
);
create index caixa_manobras_caixa_idx on caixa_manobras (caixa_id);

alter table os_anexos add column caixa_id uuid references caixas_emenda (id) on delete set null;

-- O técnico mexe nas caixas da O.S. que está com ele (responsável ou apoio) enquanto ela está em campo.
create function os_em_campo_comigo(p_os uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from ordens_servico o
     where o.id = p_os
       and o.status in ('aceita', 'em_execucao', 'pausada', 'devolvida')
       and (o.tecnico_id = auth.uid()
            or exists (select 1 from os_tecnicos_apoio a where a.os_id = o.id and a.tecnico_id = auth.uid())))
$$;

alter table caixas_emenda enable row level security;
alter table caixa_manobras enable row level security;

-- Toda a equipe consulta as caixas já cadastradas (conhecimento da rede).
create policy caixas_ler on caixas_emenda for select to authenticated using (true);
create policy caixas_tecnico_insere on caixas_emenda for insert to authenticated
  with check (criada_por = auth.uid() and os_em_campo_comigo(os_id));
create policy caixas_tecnico_altera on caixas_emenda for update to authenticated
  using (os_em_campo_comigo(os_id)) with check (os_em_campo_comigo(os_id));
create policy caixas_tecnico_remove on caixas_emenda for delete to authenticated
  using (criada_por = auth.uid() and os_em_campo_comigo(os_id));
create policy caixas_supervisor on caixas_emenda for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());

create policy manobras_ler on caixa_manobras for select to authenticated using (true);
create policy manobras_tecnico_insere on caixa_manobras for insert to authenticated
  with check (criada_por = auth.uid() and exists (
    select 1 from caixas_emenda c where c.id = caixa_id and os_em_campo_comigo(c.os_id)));
create policy manobras_tecnico_remove on caixa_manobras for delete to authenticated
  using (criada_por = auth.uid() and exists (
    select 1 from caixas_emenda c where c.id = caixa_id and os_em_campo_comigo(c.os_id)));
create policy manobras_supervisor on caixa_manobras for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());

create or replace function caixas_toca_atualizado() returns trigger
language plpgsql set search_path = public
as $$
begin
  new.atualizado_em := now();
  return new;
end $$;
create trigger caixas_emenda_atualizado before update on caixas_emenda
  for each row execute function caixas_toca_atualizado();

-- Para o mapa/KMZ: coordenadas prontas e dados da O.S.
create view caixas_mapa with (security_invoker = true) as
select c.id, c.identificacao, c.capacidade_fibras, c.saidas, c.grupos_fusionados, c.grupos_vagos, c.observacao, c.endereco,
       c.localizada_em, c.precisao_m, c.atualizado_em,
       extensions.st_y(c.posicao::extensions.geometry) as latitude,
       extensions.st_x(c.posicao::extensions.geometry) as longitude,
       o.numero as os_numero, o.ticket_acionamento, r.trecho,
       u.nome as tecnico,
       coalesce((select jsonb_agg(jsonb_build_object('fibra_entrada', m.fibra_entrada, 'saida', m.saida, 'fibra_saida', m.fibra_saida, 'motivo', m.motivo) order by m.fibra_entrada)
                   from caixa_manobras m where m.caixa_id = c.id), '[]'::jsonb) as manobras
  from caixas_emenda c
  join ordens_servico o on o.id = c.os_id
  left join rotas r on r.id = o.rota_id
  left join usuarios u on u.id = c.criada_por;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table caixas_emenda, caixa_manobras;
  end if;
end $$;
