-- Técnico Plus Backbone: tabelas do MVP
-- O.S., expediente, rastreamento GPS e alertas.

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type papel_usuario as enum ('tecnico', 'supervisor', 'admin');

create type status_os as enum (
  'rascunho',      -- criada pelo supervisor, ainda não enviada
  'enviada',       -- enviada ao técnico
  'aceita',        -- técnico confirmou o recebimento
  'em_execucao',   -- técnico iniciou o atendimento
  'concluida',     -- técnico terminou, aguardando conferência
  'devolvida',     -- supervisor devolveu para correção
  'baixada',       -- supervisor deu a baixa (encerrada)
  'cancelada'
);

create type prioridade_os as enum ('baixa', 'media', 'alta', 'emergencia');

create type tipo_anexo as enum ('foto_antes', 'foto_depois', 'assinatura', 'documento');

create type tipo_alerta as enum (
  'nova_os', 'prazo_proximo', 'os_atrasada',
  'expediente_nao_iniciado', 'encerrar_jornada', 'sem_sinal'
);

-- ---------------------------------------------------------------------------
-- Usuários (perfil ligado ao login do Supabase Auth)
-- ---------------------------------------------------------------------------

create table usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  matricula text unique,
  papel papel_usuario not null default 'tecnico',
  telefone text,
  inicio_jornada time not null default '08:00',
  fim_jornada time not null default '17:00',
  push_token text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table veiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null unique,
  modelo text,
  consumo_km_l numeric(5, 2),
  odometro_km integer,
  ativo boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Ordens de serviço
-- ---------------------------------------------------------------------------

create sequence ordens_servico_numero_seq;

create table ordens_servico (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique default nextval('ordens_servico_numero_seq'),
  tipo text not null,
  prioridade prioridade_os not null default 'media',
  status status_os not null default 'rascunho',
  titulo text not null,
  descricao text,
  endereco text,
  local extensions.geography(point, 4326),
  tecnico_id uuid references usuarios (id),
  criada_por uuid not null references usuarios (id) default auth.uid(),
  prazo timestamptz,
  enviada_em timestamptz,
  aceita_em timestamptz,
  iniciada_em timestamptz,
  concluida_em timestamptz,
  baixada_em timestamptz,
  observacao_tecnico text,
  observacao_supervisor text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter sequence ordens_servico_numero_seq owned by ordens_servico.numero;

create index ordens_servico_tecnico_status_idx on ordens_servico (tecnico_id, status);
create index ordens_servico_prazo_idx on ordens_servico (prazo) where status not in ('baixada', 'cancelada');

-- Histórico: uma linha para cada mudança de status.
create table os_eventos (
  id bigint generated always as identity primary key,
  os_id uuid not null references ordens_servico (id) on delete cascade,
  status_anterior status_os,
  status_novo status_os not null,
  usuario_id uuid references usuarios (id),
  posicao extensions.geography(point, 4326),
  observacao text,
  criado_em timestamptz not null default now()
);

create index os_eventos_os_idx on os_eventos (os_id, criado_em);

create table os_anexos (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references ordens_servico (id) on delete cascade,
  tipo tipo_anexo not null,
  caminho_arquivo text not null, -- caminho no bucket "os-anexos"
  posicao extensions.geography(point, 4326),
  enviado_por uuid not null references usuarios (id) default auth.uid(),
  criado_em timestamptz not null default now()
);

create index os_anexos_os_idx on os_anexos (os_id);

-- ---------------------------------------------------------------------------
-- Expediente e rastreamento
-- ---------------------------------------------------------------------------

create table expedientes (
  id uuid primary key default gen_random_uuid(),
  tecnico_id uuid not null references usuarios (id) default auth.uid(),
  veiculo_id uuid references veiculos (id),
  inicio timestamptz not null default now(),
  fim timestamptz,
  km_inicial integer,
  km_final integer,
  posicao_inicio extensions.geography(point, 4326),
  posicao_fim extensions.geography(point, 4326),
  distancia_gps_km numeric(8, 2), -- preenchida ao encerrar
  check (fim is null or fim >= inicio),
  check (km_final is null or km_inicial is null or km_final >= km_inicial)
);

-- Um técnico só pode ter um expediente aberto por vez.
create unique index expedientes_um_aberto_idx on expedientes (tecnico_id) where fim is null;
create index expedientes_tecnico_inicio_idx on expedientes (tecnico_id, inicio desc);

create table posicoes_gps (
  id bigint generated always as identity primary key,
  tecnico_id uuid not null references usuarios (id) default auth.uid(),
  expediente_id uuid not null references expedientes (id) on delete cascade,
  registrado_em timestamptz not null, -- hora do celular (pode chegar atrasado se offline)
  posicao extensions.geography(point, 4326) not null,
  precisao_m real,
  velocidade_kmh real,
  bateria_pct smallint,
  recebido_em timestamptz not null default now()
);

create index posicoes_gps_expediente_idx on posicoes_gps (expediente_id, registrado_em);
create index posicoes_gps_tecnico_idx on posicoes_gps (tecnico_id, registrado_em desc);

-- ---------------------------------------------------------------------------
-- Alertas
-- ---------------------------------------------------------------------------

create table alertas (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_alerta not null,
  usuario_id uuid not null references usuarios (id) on delete cascade, -- quem recebe
  os_id uuid references ordens_servico (id) on delete cascade,
  mensagem text not null,
  enviado_push_em timestamptz,
  lido_em timestamptz,
  criado_em timestamptz not null default now()
);

create index alertas_usuario_idx on alertas (usuario_id, criado_em desc);

-- ---------------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------------

create function eh_supervisor() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from usuarios
    where id = auth.uid() and papel in ('supervisor', 'admin') and ativo
  );
$$;

-- Preenche as datas de cada etapa da O.S.
create function os_preenche_datas() returns trigger
language plpgsql set search_path = public
as $$
begin
  new.atualizado_em := now();
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  case new.status
    when 'enviada' then new.enviada_em := coalesce(new.enviada_em, now());
    when 'aceita' then new.aceita_em := coalesce(new.aceita_em, now());
    when 'em_execucao' then new.iniciada_em := coalesce(new.iniciada_em, now());
    when 'concluida' then new.concluida_em := now();
    when 'baixada' then new.baixada_em := now();
    else null;
  end case;
  return new;
end;
$$;

create trigger ordens_servico_datas_trg
  before insert or update on ordens_servico
  for each row execute function os_preenche_datas();

-- Registra o histórico e avisa o técnico quando recebe uma O.S.
create function os_registra_evento() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;

  insert into os_eventos (os_id, status_anterior, status_novo, usuario_id)
  values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());

  if new.status = 'enviada' and new.tecnico_id is not null then
    insert into alertas (tipo, usuario_id, os_id, mensagem)
    values ('nova_os', new.tecnico_id, new.id,
            format('Nova O.S. #%s: %s', new.numero, new.titulo));
  end if;
  return null;
end;
$$;

create trigger ordens_servico_evento_trg
  after insert or update on ordens_servico
  for each row execute function os_registra_evento();

-- O técnico só pode mover a O.S. pelas etapas dele.
create function os_valida_transicao_tecnico() returns trigger
language plpgsql set search_path = public
as $$
begin
  if eh_supervisor() then
    return new;
  end if;

  if new.tecnico_id is distinct from old.tecnico_id
     or new.prazo is distinct from old.prazo
     or new.titulo is distinct from old.titulo
     or new.prioridade is distinct from old.prioridade then
    raise exception 'Somente o supervisor pode alterar técnico, prazo, título ou prioridade';
  end if;

  if new.status is distinct from old.status and not (
       (old.status = 'enviada' and new.status = 'aceita')
    or (old.status in ('aceita', 'devolvida') and new.status = 'em_execucao')
    or (old.status = 'em_execucao' and new.status = 'concluida')
  ) then
    raise exception 'Mudança de status não permitida para o técnico: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

create trigger ordens_servico_transicao_trg
  before update on ordens_servico
  for each row execute function os_valida_transicao_tecnico();

-- Ao encerrar o expediente, calcula a distância percorrida pelo GPS.
create function expediente_ao_encerrar() returns trigger
language plpgsql set search_path = public, extensions
as $$
begin
  if new.fim is not null and old.fim is null then
    select round((coalesce(st_length(st_makeline(posicao::geometry order by registrado_em)::geography), 0) / 1000)::numeric, 2)
      into new.distancia_gps_km
      from posicoes_gps
     where expediente_id = new.id;
  end if;
  return new;
end;
$$;

create trigger expedientes_encerrar_trg
  before update on expedientes
  for each row execute function expediente_ao_encerrar();

-- Última posição de cada técnico com expediente aberto (mapa ao vivo do painel).
create view posicao_atual_tecnicos with (security_invoker = true) as
select distinct on (p.tecnico_id)
  p.tecnico_id,
  u.nome,
  e.id as expediente_id,
  p.registrado_em,
  extensions.st_y(p.posicao::extensions.geometry) as latitude,
  extensions.st_x(p.posicao::extensions.geometry) as longitude,
  p.velocidade_kmh,
  p.bateria_pct
from posicoes_gps p
join expedientes e on e.id = p.expediente_id and e.fim is null
join usuarios u on u.id = p.tecnico_id
order by p.tecnico_id, p.registrado_em desc;

-- ---------------------------------------------------------------------------
-- Permissões (RLS): técnico vê só o que é dele; supervisor vê tudo.
-- ---------------------------------------------------------------------------

alter table usuarios enable row level security;
alter table veiculos enable row level security;
alter table ordens_servico enable row level security;
alter table os_eventos enable row level security;
alter table os_anexos enable row level security;
alter table expedientes enable row level security;
alter table posicoes_gps enable row level security;
alter table alertas enable row level security;

create policy usuarios_ler on usuarios for select to authenticated
  using (id = auth.uid() or eh_supervisor());
create policy usuarios_supervisor on usuarios for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());
create policy usuarios_proprio on usuarios for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- O próprio usuário só atualiza telefone e push_token; o resto é do supervisor.
create function usuarios_protege_campos() returns trigger
language plpgsql set search_path = public
as $$
begin
  if not eh_supervisor() and (
       new.papel is distinct from old.papel
    or new.ativo is distinct from old.ativo
    or new.matricula is distinct from old.matricula
    or new.inicio_jornada is distinct from old.inicio_jornada
    or new.fim_jornada is distinct from old.fim_jornada) then
    raise exception 'Somente o supervisor pode alterar papel, matrícula, jornada ou status';
  end if;
  return new;
end;
$$;

create trigger usuarios_protege_campos_trg
  before update on usuarios
  for each row execute function usuarios_protege_campos();

create policy veiculos_ler on veiculos for select to authenticated using (true);
create policy veiculos_supervisor on veiculos for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());

create policy os_ler on ordens_servico for select to authenticated
  using (eh_supervisor() or (tecnico_id = auth.uid() and status <> 'rascunho'));
create policy os_supervisor on ordens_servico for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());
create policy os_tecnico_atualiza on ordens_servico for update to authenticated
  using (tecnico_id = auth.uid()) with check (tecnico_id = auth.uid());

create policy os_eventos_ler on os_eventos for select to authenticated
  using (eh_supervisor() or exists (
    select 1 from ordens_servico o where o.id = os_id and o.tecnico_id = auth.uid()));

create policy os_anexos_ler on os_anexos for select to authenticated
  using (eh_supervisor() or exists (
    select 1 from ordens_servico o where o.id = os_id and o.tecnico_id = auth.uid()));
create policy os_anexos_inserir on os_anexos for insert to authenticated
  with check (enviado_por = auth.uid() and (eh_supervisor() or exists (
    select 1 from ordens_servico o where o.id = os_id and o.tecnico_id = auth.uid())));

create policy expedientes_ler on expedientes for select to authenticated
  using (tecnico_id = auth.uid() or eh_supervisor());
create policy expedientes_iniciar on expedientes for insert to authenticated
  with check (tecnico_id = auth.uid());
create policy expedientes_encerrar on expedientes for update to authenticated
  using (tecnico_id = auth.uid() or eh_supervisor())
  with check (tecnico_id = auth.uid() or eh_supervisor());

create policy posicoes_ler on posicoes_gps for select to authenticated
  using (tecnico_id = auth.uid() or eh_supervisor());
create policy posicoes_inserir on posicoes_gps for insert to authenticated
  with check (tecnico_id = auth.uid() and exists (
    select 1 from expedientes e where e.id = expediente_id and e.tecnico_id = auth.uid()));

create policy alertas_ler on alertas for select to authenticated
  using (usuario_id = auth.uid() or eh_supervisor());
create policy alertas_marcar_lido on alertas for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Tempo real no painel e no app.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table ordens_servico, posicoes_gps, alertas, expedientes;
  end if;
end $$;
