-- O que foi executado na O.S. (lançamento de cabo, caixa de emenda, poste, sobra técnica, fusões...).
-- A lista de itens fica numa tabela para o supervisor poder incluir outros depois.

create table itens_execucao (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  unidade text not null,
  ordem integer not null default 0,
  ativo boolean not null default true
);

insert into itens_execucao (nome, unidade, ordem) values
  ('Lançamento de cabo', 'm', 1),
  ('Caixa de emenda', 'un', 2),
  ('Poste implantado', 'un', 3),
  ('Sobra técnica repuxada', 'm', 4),
  ('Fusões', 'un', 5);

alter table itens_execucao enable row level security;
create policy itens_execucao_ler on itens_execucao for select to authenticated using (true);
create policy itens_execucao_supervisor on itens_execucao for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());

create table os_servicos_executados (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references ordens_servico (id) on delete cascade,
  item_id uuid not null references itens_execucao (id),
  quantidade numeric(12, 2) not null check (quantidade > 0),
  observacao text,
  lancado_por uuid not null references usuarios (id) default auth.uid(),
  lancado_em timestamptz not null default now()
);

create index os_servicos_executados_os_idx on os_servicos_executados (os_id);

alter table os_servicos_executados enable row level security;

create policy servicos_ler on os_servicos_executados for select to authenticated
  using (eh_supervisor() or exists (
    select 1 from ordens_servico o where o.id = os_id and o.tecnico_id = auth.uid()));

-- O técnico lança e corrige enquanto a O.S. está com ele (antes de concluir).
create policy servicos_tecnico_lanca on os_servicos_executados for insert to authenticated
  with check (lancado_por = auth.uid() and exists (
    select 1 from ordens_servico o
     where o.id = os_id and o.tecnico_id = auth.uid()
       and o.status in ('aceita', 'em_execucao', 'pausada', 'devolvida')));

create policy servicos_tecnico_remove on os_servicos_executados for delete to authenticated
  using (lancado_por = auth.uid() and exists (
    select 1 from ordens_servico o
     where o.id = os_id and o.tecnico_id = auth.uid()
       and o.status in ('aceita', 'em_execucao', 'pausada', 'devolvida')));

create policy servicos_supervisor on os_servicos_executados for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());


-- ---------------------------------------------------------------------------
-- Técnicos de apoio na O.S. (além do responsável)
-- ---------------------------------------------------------------------------

create table os_tecnicos_apoio (
  os_id uuid not null references ordens_servico (id) on delete cascade,
  tecnico_id uuid not null references usuarios (id),
  adicionado_por uuid not null references usuarios (id) default auth.uid(),
  adicionado_em timestamptz not null default now(),
  primary key (os_id, tecnico_id)
);

alter table os_tecnicos_apoio enable row level security;

create policy apoio_ler on os_tecnicos_apoio for select to authenticated
  using (eh_supervisor() or tecnico_id = auth.uid() or exists (
    select 1 from ordens_servico o where o.id = os_id and o.tecnico_id = auth.uid()));

create policy apoio_responsavel_adiciona on os_tecnicos_apoio for insert to authenticated
  with check (adicionado_por = auth.uid() and tecnico_id <> auth.uid() and exists (
    select 1 from ordens_servico o
     where o.id = os_id and o.tecnico_id = auth.uid()
       and o.status in ('aceita', 'em_execucao', 'pausada', 'devolvida')));

create policy apoio_responsavel_remove on os_tecnicos_apoio for delete to authenticated
  using (exists (
    select 1 from ordens_servico o
     where o.id = os_id and o.tecnico_id = auth.uid()
       and o.status in ('aceita', 'em_execucao', 'pausada', 'devolvida')));

create policy apoio_supervisor on os_tecnicos_apoio for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());

-- Lista de técnicos ativos (só id e nome) para o técnico escolher o apoio no app.
create function tecnicos_ativos() returns table (id uuid, nome text)
language sql stable security definer set search_path = public
as $$
  select u.id, u.nome from usuarios u
   where u.ativo and u.papel = 'tecnico' and auth.uid() is not null
   order by u.nome
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table os_servicos_executados, os_tecnicos_apoio;
  end if;
end $$;
