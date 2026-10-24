-- "Visualizei a O.S." (status aceita) avisa os supervisores.
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
