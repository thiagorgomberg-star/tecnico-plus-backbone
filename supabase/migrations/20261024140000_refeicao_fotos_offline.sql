-- Refeição, visão semanal do técnico, regra das 10 fotos na horizontal
-- e localização do evento registrada offline.

-- ---------------------------------------------------------------------------
-- O.S.: pausa por refeição e localização do evento
-- ---------------------------------------------------------------------------

alter table ordens_servico
  add column evento_localizado_em timestamptz,
  add column evento_posicao extensions.geography(point, 4326),
  add column evento_precisao_m real;

-- Hora informada pelo celular (ação feita offline e enviada depois).
-- Só vale se estiver nas últimas 48 horas e não for no futuro.
create function hora_do_celular(informada timestamptz) returns timestamptz
language sql stable
as $$
  select case
    when informada is not null and informada <= now() + interval '2 minutes'
         and informada >= now() - interval '48 hours'
    then informada
    else now()
  end;
$$;

create or replace function os_preenche_datas() returns trigger
language plpgsql set search_path = public
as $$
begin
  new.atualizado_em := now();
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  -- O app manda a hora real da ação no campo da etapa; sem isso vale a hora do servidor.
  -- Nenhuma etapa fica antes da anterior.
  case new.status
    when 'enviada' then new.enviada_em := coalesce(new.enviada_em, now());
    when 'aceita' then new.aceita_em := greatest(hora_do_celular(new.aceita_em), new.enviada_em);
    when 'em_execucao' then
      if tg_op = 'INSERT' or old.status <> 'pausada' then
        new.iniciada_em := greatest(hora_do_celular(new.iniciada_em), new.aceita_em);
      end if;
    when 'concluida' then
      new.concluida_em := greatest(hora_do_celular(case when tg_op = 'UPDATE' and new.concluida_em is not distinct from old.concluida_em then null else new.concluida_em end), new.iniciada_em);
    when 'baixada' then new.baixada_em := now();
    else null;
  end case;
  return new;
end;
$$;

create or replace function os_registra_evento() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  quando timestamptz := now();
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;

  quando := case new.status
    when 'aceita' then new.aceita_em
    when 'em_execucao' then coalesce(new.iniciada_em, now())
    when 'concluida' then new.concluida_em
    else now()
  end;
  if new.status = 'em_execucao' and tg_op = 'UPDATE' and old.status = 'pausada' then
    quando := now();
  end if;

  insert into os_eventos (os_id, status_anterior, status_novo, usuario_id, criado_em)
  values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid(), coalesce(quando, now()));

  if new.status = 'enviada' and new.tecnico_id is not null then
    insert into alertas (tipo, usuario_id, os_id, mensagem)
    values ('nova_os', new.tecnico_id, new.id,
            format('Nova O.S. #%s: %s', new.numero, new.titulo));
  end if;
  return null;
end;
$$;

-- Mínimo de fotos para concluir uma O.S.
create function minimo_fotos_os() returns integer
language sql immutable
as $$ select 10 $$;

create or replace function os_valida_transicao_tecnico() returns trigger
language plpgsql set search_path = public
as $$
declare
  fotos integer;
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
    or (old.status = 'em_execucao' and new.status in ('concluida', 'pausada'))
    or (old.status = 'pausada' and new.status = 'em_execucao')
  ) then
    raise exception 'Mudança de status não permitida para o técnico: % -> %', old.status, new.status;
  end if;

  if new.status = 'concluida' and old.status <> 'concluida' then
    select count(*) into fotos
      from os_anexos
     where os_id = new.id and tipo in ('foto_antes', 'foto_depois');
    if fotos < minimo_fotos_os() then
      raise exception 'A O.S. precisa de no mínimo % fotos para ser concluída (tem %)', minimo_fotos_os(), fotos
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fotos: sempre na horizontal, com hora e posição de quando foram tiradas
-- ---------------------------------------------------------------------------

alter table os_anexos
  add column largura_px integer,
  add column altura_px integer,
  add column tirada_em timestamptz,
  add constraint os_anexos_foto_horizontal check (
    tipo not in ('foto_antes', 'foto_depois')
    or (largura_px is not null and altura_px is not null and largura_px > altura_px)
  );

-- ---------------------------------------------------------------------------
-- Refeição: pausa qualquer O.S. em execução e retoma ao encerrar
-- ---------------------------------------------------------------------------

create table refeicoes (
  id uuid primary key default gen_random_uuid(),
  tecnico_id uuid not null references usuarios (id) default auth.uid(),
  expediente_id uuid not null references expedientes (id) on delete cascade,
  inicio timestamptz not null default now(),
  fim timestamptz,
  posicao_inicio extensions.geography(point, 4326),
  os_pausada_id uuid references ordens_servico (id),
  check (fim is null or fim >= inicio)
);

create unique index refeicoes_uma_aberta_idx on refeicoes (tecnico_id) where fim is null;
create index refeicoes_expediente_idx on refeicoes (expediente_id);

alter table refeicoes enable row level security;

create policy refeicoes_ler on refeicoes for select to authenticated
  using (tecnico_id = auth.uid() or eh_supervisor());
create policy refeicoes_inserir on refeicoes for insert to authenticated
  with check (tecnico_id = auth.uid());
create policy refeicoes_encerrar on refeicoes for update to authenticated
  using (tecnico_id = auth.uid()) with check (tecnico_id = auth.uid());

-- Inicia a refeição; a O.S. em execução (se houver) fica pausada.
create function iniciar_refeicao(inicio timestamptz default null, latitude float8 default null, longitude float8 default null)
returns refeicoes
language plpgsql set search_path = public, extensions
as $$
declare
  exp_id uuid;
  os_id uuid;
  r refeicoes;
begin
  select id into exp_id from expedientes where tecnico_id = auth.uid() and fim is null;
  if exp_id is null then
    raise exception 'Inicie o expediente antes da refeição';
  end if;

  select id into os_id from ordens_servico
   where tecnico_id = auth.uid() and status = 'em_execucao'
   order by iniciada_em desc limit 1;

  if os_id is not null then
    update ordens_servico set status = 'pausada' where id = os_id;
  end if;

  insert into refeicoes (expediente_id, inicio, posicao_inicio, os_pausada_id)
  values (
    exp_id,
    hora_do_celular(inicio),
    case when latitude is not null then st_setsrid(st_makepoint(longitude, latitude), 4326)::geography end,
    os_id
  )
  returning * into r;
  return r;
end;
$$;

-- Encerra a refeição e retoma a O.S. que estava em execução.
create function encerrar_refeicao(fim timestamptz default null)
returns refeicoes
language plpgsql set search_path = public
as $$
declare
  r refeicoes;
begin
  update refeicoes set fim = hora_do_celular(encerrar_refeicao.fim)
   where tecnico_id = auth.uid() and refeicoes.fim is null
  returning * into r;

  if r.id is null then
    raise exception 'Nenhuma refeição em andamento';
  end if;

  if r.os_pausada_id is not null then
    update ordens_servico set status = 'em_execucao'
     where id = r.os_pausada_id and status = 'pausada';
  end if;
  return r;
end;
$$;

-- Sem revoke: as duas funções rodam com a permissão de quem chama e exigem login (auth.uid()).

-- ---------------------------------------------------------------------------
-- Visão do técnico: O.S. em aberto + encerradas nos últimos 7 dias
-- ---------------------------------------------------------------------------

alter policy os_ler on ordens_servico
  using (
    eh_supervisor()
    or (
      tecnico_id = auth.uid()
      and status <> 'rascunho'
      and (status not in ('baixada', 'cancelada') or atualizado_em >= now() - interval '7 days')
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table refeicoes;
  end if;
end $$;

-- Cargo do usuário, impresso na máscara das fotos junto com o nome.
alter table usuarios add column cargo text;

create or replace function usuarios_protege_campos() returns trigger
language plpgsql set search_path = public
as $$
begin
  if not eh_supervisor() and (
       new.papel is distinct from old.papel
    or new.ativo is distinct from old.ativo
    or new.matricula is distinct from old.matricula
    or new.cargo is distinct from old.cargo
    or new.nome is distinct from old.nome
    or new.inicio_jornada is distinct from old.inicio_jornada
    or new.fim_jornada is distinct from old.fim_jornada) then
    raise exception 'Somente o supervisor pode alterar nome, cargo, papel, matrícula, jornada ou status';
  end if;
  return new;
end;
$$;
