-- Backlog visível ao técnico: O.S. ainda não despachadas (status rascunho) aparecem na tela inicial do app,
-- com endereço/posição para ele se deslocar. Ao tocar em "Assumir", a O.S. passa para ele já como Visualizada
-- e os supervisores recebem o aviso.

create or replace function backlog_disponivel()
returns table (
  id uuid, numero integer, tipo text, prioridade prioridade_os, titulo text, descricao text, endereco text,
  lat double precision, lng double precision, ticket_acionamento text, sla_limite timestamptz, criado_em timestamptz,
  reservada boolean
)
language sql stable security definer set search_path = public, extensions
as $$
  select o.id, o.numero, o.tipo, o.prioridade, o.titulo, o.descricao, o.endereco,
         st_y(o.local::geometry), st_x(o.local::geometry), o.ticket_acionamento, o.sla_limite, o.criado_em,
         o.tecnico_id = auth.uid()
    from ordens_servico o
   where o.status = 'rascunho'
     and (o.tecnico_id is null or o.tecnico_id = auth.uid())
     and exists (select 1 from usuarios u where u.id = auth.uid() and u.ativo)
   order by case o.prioridade when 'emergencia' then 0 when 'alta' then 1 when 'media' then 2 else 3 end, o.criado_em;
$$;
revoke all on function backlog_disponivel() from public, anon;
grant execute on function backlog_disponivel() to authenticated;

-- A trava de transição do técnico deixa passar só a mudança feita por assumir_backlog (marcada na transação).
create or replace function os_valida_transicao_tecnico() returns trigger
language plpgsql set search_path = public
as $$
declare
  fotos integer;
begin
  if eh_supervisor() or current_setting('app.assumir_backlog', true) = 'sim' then
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

create or replace function assumir_backlog(p_os uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_numero integer;
  v_titulo text;
  v_nome text;
begin
  select nome into v_nome from usuarios where id = auth.uid() and ativo and papel = 'tecnico';
  if v_nome is null then
    raise exception 'Somente técnicos podem assumir O.S. do backlog';
  end if;

  perform set_config('app.assumir_backlog', 'sim', true);
  update ordens_servico
     set tecnico_id = auth.uid(), status = 'aceita', enviada_em = now()
   where id = p_os and status = 'rascunho' and (tecnico_id is null or tecnico_id = auth.uid())
  returning numero, titulo into v_numero, v_titulo;
  perform set_config('app.assumir_backlog', '', true);

  if v_numero is null then
    raise exception 'Esta O.S. já foi assumida por outro técnico ou despachada pelo supervisor';
  end if;

  -- O aviso padrão diz "visualizou"; aqui deixa claro que veio do backlog.
  update alertas set mensagem = format('%s assumiu do backlog a O.S. #%s: %s', v_nome, v_numero, v_titulo)
   where os_id = p_os and tipo = 'os_visualizada' and criado_em = now();
end;
$$;
revoke all on function assumir_backlog(uuid) from public, anon;
grant execute on function assumir_backlog(uuid) to authenticated;
