-- Reabrir O.S. encerrada (baixada, cancelada ou aguardando baixa), só pelo supervisor:
--   'tecnico'    -> volta para campo como enviada ao técnico escolhido (o mesmo ou outro), que recebe o aviso;
--   'supervisor' -> volta para "Aguardando baixa" para o supervisor alterar e dar a baixa de novo
--                   (cancelada que nunca foi concluída volta para o backlog).
-- O motivo fica na O.S. e no histórico.

create or replace function os_preenche_datas() returns trigger
language plpgsql set search_path = public
as $$
begin
  new.atualizado_em := now();
  -- A reabertura grava as datas ela mesma (mantém a conclusão original ao reabrir para edição).
  if current_setting('app.reabrir_os', true) = 'sim' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.sla_limite := coalesce(new.criado_em, now()) + sla_os();
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  case new.status
    when 'enviada' then new.enviada_em := coalesce(new.enviada_em, now());
    when 'aceita' then new.aceita_em := greatest(hora_do_celular(new.aceita_em), new.enviada_em);
    when 'em_execucao' then
      if tg_op = 'INSERT' then
        new.iniciada_em := hora_do_celular(new.iniciada_em);
        new.enviada_em := coalesce(new.enviada_em, new.iniciada_em);
        new.aceita_em := coalesce(new.aceita_em, new.iniciada_em);
      elsif old.status <> 'pausada' then
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

-- Na reabertura o evento do histórico leva a hora da reabertura.
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
  if new.status = 'em_execucao' and tg_op = 'UPDATE' and old.status = 'pausada'
     or current_setting('app.reabrir_os', true) = 'sim' then
    quando := now();
  end if;

  insert into os_eventos (os_id, status_anterior, status_novo, usuario_id, criado_em)
  values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid(), coalesce(quando, now()));

  if new.status = 'enviada' and new.tecnico_id is not null then
    insert into alertas (tipo, usuario_id, os_id, mensagem)
    values ('nova_os', new.tecnico_id, new.id,
            format('Nova O.S. #%s: %s', new.numero, new.titulo));
  end if;

  if new.status = 'aceita' and tg_op = 'UPDATE' then
    insert into alertas (tipo, usuario_id, os_id, mensagem)
    select 'os_visualizada', u.id, new.id,
           format('%s visualizou a O.S. #%s: %s',
                  coalesce((select nome from usuarios where id = new.tecnico_id), 'Técnico'), new.numero, new.titulo)
      from usuarios u
     where u.ativo and u.papel in ('supervisor', 'admin');
  end if;
  return null;
end;
$$;

create or replace function reabrir_os(p_os uuid, p_modo text, p_tecnico uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  o ordens_servico%rowtype;
  v_status status_os;
  v_tecnico uuid;
  v_nome text;
begin
  if not eh_supervisor() then
    raise exception 'Somente o supervisor pode reabrir uma O.S.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da reabertura';
  end if;
  select * into o from ordens_servico where id = p_os for update;
  if not found then
    raise exception 'O.S. não encontrada';
  end if;
  if o.status not in ('baixada', 'cancelada', 'concluida') then
    raise exception 'Só dá para reabrir O.S. baixada, cancelada ou aguardando baixa (está %)', o.status;
  end if;

  perform set_config('app.reabrir_os', 'sim', true);
  if p_modo = 'tecnico' then
    v_tecnico := coalesce(p_tecnico, o.tecnico_id);
    select nome into v_nome from usuarios where id = v_tecnico and ativo;
    if v_nome is null then
      raise exception 'Escolha um técnico ativo';
    end if;
    update ordens_servico
       set status = 'enviada', tecnico_id = v_tecnico, enviada_em = now(), aceita_em = null, iniciada_em = null,
           concluida_em = null, baixada_em = null, continua_em = null,
           pausa_solicitada_em = null, pausa_motivo = null,
           observacao_supervisor = trim(p_motivo), reaberta_em = now(), reaberta_motivo = trim(p_motivo)
     where id = p_os;
    -- O gatilho criou o aviso "Nova O.S."; vira "O.S. reaberta" antes do push sair (ele lê o alerta após o commit).
    update alertas
       set tipo = 'os_reaberta',
           mensagem = format('O.S. #%s reaberta para você: %s. Motivo: %s', o.numero, o.titulo, trim(p_motivo))
     where os_id = p_os and tipo = 'nova_os' and criado_em = now();
  elsif p_modo = 'supervisor' then
    if o.status = 'concluida' then
      raise exception 'A O.S. já está aguardando baixa: pode editar direto';
    end if;
    v_status := case when o.concluida_em is not null then 'concluida' else 'rascunho' end;
    update ordens_servico
       set status = v_status, baixada_em = null, reaberta_em = now(), reaberta_motivo = trim(p_motivo)
     where id = p_os;
  else
    raise exception 'Modo de reabertura inválido: %', p_modo;
  end if;
  perform set_config('app.reabrir_os', '', true);

  update os_eventos set observacao = 'Reaberta: ' || trim(p_motivo)
   where id = (select max(id) from os_eventos where os_id = p_os);
end;
$$;
revoke all on function reabrir_os(uuid, text, uuid, text) from public, anon;
grant execute on function reabrir_os(uuid, text, uuid, text) to authenticated;
