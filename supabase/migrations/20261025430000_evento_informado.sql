-- "Informar evento": o técnico registra no app um evento visto em campo (descrição, localização e fotos).
-- Vira uma O.S. "Evento informado" no backlog, sem técnico: ele ou qualquer outro técnico assume e executa.
-- As fotos de quem informou ficam como fotos de referência para a baixa no mesmo ângulo.

alter table ordens_servico add column if not exists informado_por uuid references usuarios (id);

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
    raise exception 'Usuário sem permissão para informar evento';
  end if;
  if coalesce(trim(p_descricao), '') = '' or p_lat is null or p_lng is null then
    raise exception 'Informe a descrição e capture a localização do evento';
  end if;

  insert into ordens_servico (id, tipo, prioridade, status, titulo, descricao, endereco, local, criada_por, informado_por, evento_localizado_em)
  values (p_id, 'Evento informado',
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
    select 'nova_os', u.id, p_id, format('%s informou um evento: %s', v_nome, p_categoria)
      from usuarios u where u.ativo and u.papel in ('supervisor', 'admin');
  end if;
end;
$$;
revoke all on function informar_evento(uuid, text, text, text, text, double precision, double precision, real, text, timestamptz) from public, anon;
grant execute on function informar_evento(uuid, text, text, text, text, double precision, double precision, real, text, timestamptz) to authenticated;

-- Quem informou pode enviar e ver as fotos do evento enquanto ele está no backlog. O técnico não enxerga O.S. em
-- rascunho pela política da tabela, então a checagem passa por funções do banco.
create or replace function informou_os(p_os uuid, p_so_backlog boolean) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from ordens_servico o
                  where o.id = p_os and o.informado_por = auth.uid() and (not p_so_backlog or o.status = 'rascunho'));
$$;
revoke all on function informou_os(uuid, boolean) from public, anon;
grant execute on function informou_os(uuid, boolean) to authenticated;

create or replace function informou_os_texto(p_os text, p_so_backlog boolean) returns boolean
language sql stable security definer set search_path = public
as $$
  select case when p_os ~ '^[0-9a-f-]{36}$' then informou_os(p_os::uuid, p_so_backlog) else false end;
$$;
revoke all on function informou_os_texto(text, boolean) from public, anon;
grant execute on function informou_os_texto(text, boolean) to authenticated;

alter policy os_anexos_ler on os_anexos
  using (eh_supervisor() or informou_os(os_id, false) or exists (
    select 1 from ordens_servico o where o.id = os_id and o.tecnico_id = auth.uid()));
alter policy os_anexos_inserir on os_anexos
  with check (enviado_por = auth.uid() and (eh_supervisor() or informou_os(os_id, true) or exists (
    select 1 from ordens_servico o where o.id = os_id and o.tecnico_id = auth.uid())));
alter policy os_anexos_storage_ler on storage.objects
  using (
    bucket_id = 'os-anexos'
    and (public.eh_supervisor() or public.informou_os_texto((storage.foldername(name))[1], false) or exists (
      select 1 from public.ordens_servico o
      where o.id::text = (storage.foldername(name))[1] and o.tecnico_id = auth.uid()))
  );
alter policy os_anexos_storage_enviar on storage.objects
  with check (
    bucket_id = 'os-anexos'
    and (public.eh_supervisor() or public.informou_os_texto((storage.foldername(name))[1], true) or exists (
      select 1 from public.ordens_servico o
      where o.id::text = (storage.foldername(name))[1] and o.tecnico_id = auth.uid()))
  );

-- Fotos de referência: as do ponto da vistoria ou as tiradas por quem informou o evento.
create or replace function fotos_referencia(p_os uuid)
returns table (id uuid, caminho_arquivo text, criado_em timestamptz)
language sql stable security definer set search_path = public
as $$
  select a.id, a.caminho_arquivo, a.criado_em
    from ordens_servico o
    join os_anexos a on (a.ponto_id = o.origem_ponto_id)
                     or (o.informado_por is not null and a.os_id = o.id and a.enviado_por = o.informado_por and a.tipo = 'foto_antes')
   where o.id = p_os and (o.tecnico_id = auth.uid() or o.informado_por = auth.uid() or eh_supervisor())
   order by a.criado_em;
$$;
