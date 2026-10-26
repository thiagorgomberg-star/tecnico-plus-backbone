-- Reabrir também para o backlog geral (sem técnico): qualquer técnico pode assumir pelo app.
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
  elsif p_modo = 'backlog' then
    update ordens_servico
       set status = 'rascunho', tecnico_id = null, enviada_em = null, aceita_em = null, iniciada_em = null,
           concluida_em = null, baixada_em = null, continua_em = null,
           pausa_solicitada_em = null, pausa_motivo = null,
           observacao_supervisor = trim(p_motivo), reaberta_em = now(), reaberta_motivo = trim(p_motivo)
     where id = p_os;
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
