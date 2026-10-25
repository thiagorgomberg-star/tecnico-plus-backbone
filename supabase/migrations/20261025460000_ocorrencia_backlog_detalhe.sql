-- "Informar evento" passa a se chamar "Informar ocorrência": o tipo da O.S. vira "Ocorrência informada".
-- E o técnico pode abrir uma O.S. do backlog antes de assumir: vê todos os dados e as fotos de quem informou ou vistoriou.

create or replace function informar_evento(
  p_id uuid, p_categoria text, p_gravidade text, p_descricao text, p_via text,
  p_lat double precision, p_lng double precision, p_precisao real, p_endereco text, p_quando timestamptz
) returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_nome text;
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
    insert into alertas (tipo, usuario_id, os_id, mensagem)
    select 'nova_os', u.id, p_id, format('%s informou uma ocorrência: %s', v_nome, p_categoria)
      from usuarios u where u.ativo and u.papel in ('supervisor', 'admin');
  end if;
end;
$$;

update ordens_servico set tipo = 'Ocorrência informada' where tipo = 'Evento informado';

create or replace view mapa_eventos with (security_invoker = true) as
select 'informado'::text as fonte, o.id, o.titulo as descricao, o.prioridade::text as gravidade, o.criado_em,
       u.nome as tecnico, o.status::text as situacao, o.numero as os_numero,
       extensions.st_y(o.local::extensions.geometry) as latitude, extensions.st_x(o.local::extensions.geometry) as longitude
  from ordens_servico o
  left join usuarios u on u.id = o.informado_por
 where o.tipo in ('Ocorrência informada', 'Evento informado') and o.status <> 'cancelada' and o.local is not null
union all
select 'vistoria', p.id,
       case when p.categoria = 'poste' then 'Poste ' || coalesce(p.identificacao, '') || ' a trocar' else coalesce(p.ocorrencia, 'ocorrência') end,
       coalesce(p.gravidade, case when p.precisa_troca then 'alta' else 'media' end), p.criado_em,
       u.nome, case when p.os_gerada_id is not null then 'gerou O.S.' else 'anotado' end, o.numero,
       extensions.st_y(p.posicao::extensions.geometry), extensions.st_x(p.posicao::extensions.geometry)
  from vistoria_pontos p
  join ordens_servico o on o.id = p.os_id
  left join usuarios u on u.id = p.criada_por
 where p.posicao is not null and (p.categoria = 'ocorrencia' or p.precisa_troca or p.gerar_os);

-- O.S. que o técnico enxerga no backlog (rascunho livre ou reservada para ele).
create or replace function ve_backlog(p_os uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from ordens_servico o
                  where o.id = p_os and o.status = 'rascunho' and (o.tecnico_id is null or o.tecnico_id = auth.uid())
                    and exists (select 1 from usuarios u where u.id = auth.uid() and u.ativo));
$$;
revoke all on function ve_backlog(uuid) from public, anon;
grant execute on function ve_backlog(uuid) to authenticated;

create or replace function fotos_referencia(p_os uuid)
returns table (id uuid, caminho_arquivo text, criado_em timestamptz)
language sql stable security definer set search_path = public
as $$
  select a.id, a.caminho_arquivo, a.criado_em
    from ordens_servico o
    join os_anexos a on (a.ponto_id = o.origem_ponto_id)
                     or (o.informado_por is not null and a.os_id = o.id and a.enviado_por = o.informado_por and a.tipo = 'foto_antes')
   where o.id = p_os and (o.tecnico_id = auth.uid() or o.informado_por = auth.uid() or eh_supervisor() or ve_backlog(o.id))
   order by a.criado_em;
$$;

-- Arquivo que é foto de referência de uma O.S. do backlog visível ao técnico.
create or replace function foto_do_backlog(p_nome text) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from os_anexos a
      join ordens_servico o on (a.ponto_id = o.origem_ponto_id)
                            or (o.informado_por is not null and a.os_id = o.id and a.enviado_por = o.informado_por)
     where a.caminho_arquivo = p_nome and ve_backlog(o.id));
$$;
revoke all on function foto_do_backlog(text) from public, anon;
grant execute on function foto_do_backlog(text) to authenticated;

alter policy os_anexos_storage_referencia_ler on storage.objects
  using (
    bucket_id = 'os-anexos'
    and (public.foto_do_backlog(name) or exists (
      select 1 from public.os_anexos a
        join public.ordens_servico o on o.origem_ponto_id = a.ponto_id
       where a.caminho_arquivo = name and o.tecnico_id = auth.uid()))
  );

-- Dados extras da O.S. do backlog para a tela de detalhe (quem abriu/informou, trecho, origem, observações).
create or replace function detalhe_backlog(p_os uuid) returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'criada_por', c.nome, 'informado_por', i.nome, 'trecho', r.trecho, 'regiao', r.regiao,
    'observacao_supervisor', o.observacao_supervisor, 'prazo', o.prazo,
    'evento_localizado_em', o.evento_localizado_em, 'evento_precisao_m', o.evento_precisao_m,
    'ponto', case when p.id is not null then jsonb_build_object('categoria', p.categoria, 'identificacao', p.identificacao,
                    'ocorrencia', p.ocorrencia, 'observacao', p.observacao, 'via', p.via_nome) end,
    'fotos', (select count(*) from fotos_referencia(o.id)))
    from ordens_servico o
    left join usuarios c on c.id = o.criada_por
    left join usuarios i on i.id = o.informado_por
    left join rotas r on r.id = o.rota_id
    left join vistoria_pontos p on p.id = o.origem_ponto_id
   where o.id = p_os and (ve_backlog(o.id) or eh_supervisor());
$$;
revoke all on function detalhe_backlog(uuid) from public, anon;
grant execute on function detalhe_backlog(uuid) to authenticated;
