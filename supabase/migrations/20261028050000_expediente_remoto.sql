-- Supervisor encerra remotamente o expediente de um técnico (esqueceu aberto, celular sem bateria etc.).
alter type tipo_alerta add value if not exists 'expediente_encerrado';
alter table expedientes add column if not exists encerrado_por uuid references usuarios(id);
alter table expedientes add column if not exists encerrado_motivo text;

-- O encerramento remoto vale mesmo com O.S. aberta (o técnico continua com ela).
create or replace function expediente_bloqueia_encerrar()
returns trigger
language plpgsql set search_path = public
as $$
declare
  aberta integer;
begin
  if new.fim is not null and old.fim is null and coalesce(current_setting('app.encerramento_remoto', true), '') <> 'sim' then
    select numero into aberta from ordens_servico
     where tecnico_id = new.tecnico_id and status in ('enviada', 'aceita', 'em_execucao', 'pausada', 'devolvida')
       and not (status = 'pausada' and continua_em is not null)
     order by numero limit 1;
    if aberta is not null then
      raise exception 'Conclua a O.S. #% antes de encerrar o expediente', aberta
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create or replace function encerrar_expediente_remoto(p_tecnico uuid, p_motivo text)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  n integer;
begin
  if not eh_supervisor() then
    raise exception 'Somente o supervisor pode encerrar o expediente de outro usuário';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo';
  end if;
  update refeicoes set fim = now() where tecnico_id = p_tecnico and fim is null;
  perform set_config('app.encerramento_remoto', 'sim', true);
  update expedientes set fim = now(), encerrado_por = auth.uid(), encerrado_motivo = trim(p_motivo)
   where tecnico_id = p_tecnico and fim is null;
  get diagnostics n = row_count;
  perform set_config('app.encerramento_remoto', '', true);
  if n > 0 then
    insert into alertas (tipo, usuario_id, mensagem)
    values ('expediente_encerrado', p_tecnico, format('Seu expediente foi encerrado pelo supervisor. Motivo: %s', trim(p_motivo)));
  end if;
  return n;
end;
$$;
revoke execute on function encerrar_expediente_remoto(uuid, text) from anon, public;
grant execute on function encerrar_expediente_remoto(uuid, text) to authenticated;
