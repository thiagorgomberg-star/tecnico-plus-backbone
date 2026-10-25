-- Vistoria gera O.S. secundária: o ponto marcado "gerar O.S." vira uma Preventiva rede no backlog (sem técnico),
-- com a posição do ponto. As fotos do ponto servem de referência para quem for executar a correção.

alter table vistoria_pontos add column if not exists gerar_os boolean not null default false;
alter table vistoria_pontos add column if not exists os_gerada_id uuid references ordens_servico (id) on delete set null;
alter table ordens_servico add column if not exists origem_ponto_id uuid references vistoria_pontos (id) on delete set null;
create index if not exists ordens_servico_origem_ponto_idx on ordens_servico (origem_ponto_id) where origem_ponto_id is not null;

create or replace function vistoria_gera_os() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_os ordens_servico;
  v_titulo text;
  v_desc text;
  v_nova uuid;
begin
  if not new.gerar_os or new.os_gerada_id is not null then
    return null;
  end if;
  select * into v_os from ordens_servico where id = new.os_id;

  v_titulo := case when new.categoria = 'poste'
    then format('Correção poste %s', coalesce(new.identificacao, ''))
    else format('Correção: %s', case new.ocorrencia
      when 'cabo_exposto' then 'cabo exposto' when 'flecha_baixa' then 'flecha baixa' when 'vegetacao' then 'vegetação'
      when 'travessia' then 'travessia' when 'reserva_tecnica' then 'reserva técnica' when 'cabo_danificado' then 'cabo danificado'
      when 'ferragem' then 'ferragem / ancoragem' when 'roedor' then 'roedor' else 'ocorrência' end) end
    || coalesce(' · ' || nullif(new.via_nome, ''), '');

  v_desc := concat_ws(E'\n',
    format('Gerada na vistoria O.S. #%s (%s).', v_os.numero, v_os.tipo),
    case when new.categoria = 'poste' then nullif(concat_ws(', ',
      case when new.precisa_troca then 'precisa trocar o poste' end,
      case new.estado_base when 'podre' then 'base podre' when 'cupim' then 'cupim na base' when 'erosao' then 'erosão no pé' end,
      case when new.inclinado then 'inclinado' end,
      case when new.rachado then 'rachado' end,
      case new.estai when 'frouxo' then 'estai frouxo' when 'ausente' then 'estai faltando' end), '') end,
    case when new.licenciamento = 'sem_licenca' then 'Trecho sem licenciamento.' end,
    nullif(new.observacao, ''),
    'Fotos da vistoria em "Fotos de referência": tire as fotos de depois no mesmo ângulo.');

  insert into ordens_servico (tipo, prioridade, status, titulo, descricao, endereco, local, criada_por, origem_ponto_id)
  values ('Preventiva rede',
          case when new.gravidade = 'alta' or new.precisa_troca then 'alta'::prioridade_os else 'media'::prioridade_os end,
          'rascunho', v_titulo, v_desc, coalesce(nullif(new.endereco, ''), new.via_nome), new.posicao, new.criada_por, new.id)
  returning id into v_nova;

  update vistoria_pontos set os_gerada_id = v_nova where id = new.id;

  insert into alertas (tipo, usuario_id, os_id, mensagem)
  select 'nova_os', u.id, v_nova, format('Vistoria #%s gerou O.S. no backlog: %s', v_os.numero, v_titulo)
    from usuarios u where u.ativo and u.papel in ('supervisor', 'admin');
  return null;
end;
$$;

create trigger vistoria_gera_os after insert or update of gerar_os on vistoria_pontos
  for each row execute function vistoria_gera_os();

-- Fotos de referência (tiradas no ponto da vistoria) para o técnico da O.S. secundária.
create or replace function fotos_referencia(p_os uuid)
returns table (id uuid, caminho_arquivo text, criado_em timestamptz)
language sql stable security definer set search_path = public
as $$
  select a.id, a.caminho_arquivo, a.criado_em
    from ordens_servico o
    join os_anexos a on a.ponto_id = o.origem_ponto_id
   where o.id = p_os and (o.tecnico_id = auth.uid() or eh_supervisor())
   order by a.criado_em;
$$;
revoke all on function fotos_referencia(uuid) from public, anon;
grant execute on function fotos_referencia(uuid) to authenticated;

create policy os_anexos_storage_referencia_ler on storage.objects for select to authenticated
  using (
    bucket_id = 'os-anexos'
    and exists (
      select 1 from public.os_anexos a
        join public.ordens_servico o on o.origem_ponto_id = a.ponto_id
       where a.caminho_arquivo = name and o.tecnico_id = auth.uid())
  );

-- A view do mapa passa a mostrar se o ponto gerou O.S.
create or replace view vistoria_pontos_mapa with (security_invoker = true) as
select p.id, p.os_id, p.categoria, p.identificacao, p.endereco, p.precisao_m, p.localizada_em,
       p.material, p.estado_base, p.inclinado, p.rachado, p.estai, p.precisa_troca, p.tipo_via, p.via_nome,
       p.ocorrencia, p.gravidade, p.observacao, p.criado_em, p.atualizado_em,
       extensions.st_y(p.posicao::extensions.geometry) as latitude,
       extensions.st_x(p.posicao::extensions.geometry) as longitude,
       o.numero as os_numero, o.titulo as os_titulo, o.tecnico_id, u.nome as tecnico,
       p.licenciamento, o.tipo as os_tipo,
       p.gerar_os, p.os_gerada_id, g.numero as os_gerada_numero, g.status as os_gerada_status
  from vistoria_pontos p
  join ordens_servico o on o.id = p.os_id
  left join usuarios u on u.id = o.tecnico_id
  left join ordens_servico g on g.id = p.os_gerada_id;
