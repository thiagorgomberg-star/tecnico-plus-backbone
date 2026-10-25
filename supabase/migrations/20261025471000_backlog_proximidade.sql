-- Ocorrência duplicada: o app consulta as O.S. abertas a até 200 m antes de enviar, e o supervisor é avisado
-- quando uma ocorrência nova cai perto de outra aberta.
-- Prioridade alta no backlog: o técnico em expediente mais perto (última posição do GPS nas últimas 2 h) recebe push.

create or replace function ocorrencias_proximas(p_lat double precision, p_lng double precision, p_raio real default 200)
returns table (id uuid, numero integer, tipo text, titulo text, status status_os, criado_em timestamptz, distancia_m real, tecnico text)
language sql stable security definer set search_path = public, extensions
as $$
  select o.id, o.numero, o.tipo, o.titulo, o.status, o.criado_em,
         st_distance(o.local, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)::real, u.nome
    from ordens_servico o
    left join usuarios u on u.id = o.tecnico_id
   where o.status not in ('concluida', 'baixada', 'cancelada') and o.local is not null
     and st_dwithin(o.local, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, least(p_raio, 2000))
     and exists (select 1 from usuarios a where a.id = auth.uid() and a.ativo)
   order by 7
   limit 5;
$$;
revoke all on function ocorrencias_proximas(double precision, double precision, real) from public, anon;
grant execute on function ocorrencias_proximas(double precision, double precision, real) to authenticated;

create or replace function informar_evento(
  p_id uuid, p_categoria text, p_gravidade text, p_descricao text, p_via text,
  p_lat double precision, p_lng double precision, p_precisao real, p_endereco text, p_quando timestamptz
) returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_nome text;
  v_perto integer;
begin
  select nome into v_nome from usuarios where id = auth.uid() and ativo;
  if v_nome is null then
    raise exception 'Usuário sem permissão para informar ocorrência';
  end if;
  if coalesce(trim(p_descricao), '') = '' or p_lat is null or p_lng is null then
    raise exception 'Informe a descrição e capture a localização da ocorrência';
  end if;

  insert into ordens_servico (id, tipo, prioridade, status, titulo, descricao, endereco, local, criada_por, informado_por, evento_localizado_em)
  values (p_id, 'Ocorrência informada',
          case p_gravidade when 'alta' then 'alta'::prioridade_os when 'baixa' then 'baixa'::prioridade_os else 'media'::prioridade_os end,
          'rascunho',
          p_categoria || coalesce(' · ' || nullif(trim(p_via), ''), ''),
          concat_ws(E'\n', trim(p_descricao),
            format('Informado por %s em %s.', v_nome, to_char(coalesce(p_quando, now()) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')),
            case when p_precisao is not null then format('Localização com precisão de %s m.', round(p_precisao)) end),
          coalesce(nullif(trim(p_endereco), ''), nullif(trim(p_via), '')),
          st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
          auth.uid(), auth.uid(), coalesce(hora_do_celular(p_quando), now()))
  on conflict (id) do nothing;

  if found then
    select o.numero into v_perto from ordens_servico o
     where o.id <> p_id and o.status not in ('concluida', 'baixada', 'cancelada') and o.local is not null
       and st_dwithin(o.local, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, 200)
     order by st_distance(o.local, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) limit 1;
    insert into alertas (tipo, usuario_id, os_id, mensagem)
    select 'nova_os', u.id, p_id, format('%s informou uma ocorrência: %s', v_nome, p_categoria)
           || coalesce(format(' (possível duplicada da O.S. #%s, a menos de 200 m)', v_perto), '')
      from usuarios u where u.ativo and u.papel in ('supervisor', 'admin');
  end if;
end;
$$;

create or replace function avisar_tecnico_proximo() returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_tecnico uuid;
  v_km numeric;
begin
  select e.tecnico_id, round((st_distance(p.posicao, new.local) / 1000)::numeric, 1)
    into v_tecnico, v_km
    from expedientes e
    join usuarios u on u.id = e.tecnico_id and u.ativo and u.papel = 'tecnico'
    join lateral (select g.posicao, g.registrado_em from posicoes_gps g
                   where g.expediente_id = e.id order by g.registrado_em desc limit 1) p on true
   where e.fim is null and p.registrado_em > now() - interval '2 hours'
     and e.tecnico_id is distinct from new.informado_por
   order by st_distance(p.posicao, new.local)
   limit 1;
  if v_tecnico is not null then
    insert into alertas (tipo, usuario_id, os_id, mensagem)
    values ('backlog_proximo', v_tecnico, new.id,
            format('Prioridade %s a %s km de você: O.S. #%s %s. Veja no Backlog e assuma se puder atender.',
                   new.prioridade, replace(v_km::text, '.', ','), new.numero, new.titulo));
  end if;
  return null;
end;
$$;

create or replace trigger avisar_tecnico_proximo after insert on ordens_servico
  for each row when (new.status = 'rascunho' and new.tecnico_id is null and new.local is not null
                     and new.prioridade in ('alta', 'emergencia'))
  execute function avisar_tecnico_proximo();
