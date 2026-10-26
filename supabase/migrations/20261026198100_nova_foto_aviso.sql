-- Aviso ao supervisor quando o técnico manda foto numa O.S. Para não encher o sino, fotos da mesma O.S.
-- dentro de 15 min (aviso ainda não lido) somam no mesmo aviso. Clicar no aviso abre a O.S. no painel.
create or replace function os_anexo_avisar_foto() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  o ordens_servico%rowtype;
  v_nome text;
  u record;
  v_alerta uuid;
  v_qtd integer;
begin
  if exists (select 1 from usuarios where id = new.enviado_por and papel in ('supervisor', 'admin')) then return new; end if;
  select * into o from ordens_servico where id = new.os_id;
  if not found then return new; end if;
  select nome into v_nome from usuarios where id = new.enviado_por;

  for u in select id from usuarios where ativo and papel in ('supervisor', 'admin') loop
    select id into v_alerta from alertas
     where usuario_id = u.id and os_id = o.id and tipo = 'nova_foto' and lido_em is null
       and criado_em > now() - interval '15 minutes'
     order by criado_em desc limit 1;
    if v_alerta is null then
      insert into alertas (tipo, usuario_id, os_id, mensagem)
      values ('nova_foto', u.id, o.id, format('Nova foto na O.S. #%s (%s), enviada por %s', o.numero, o.titulo, coalesce(v_nome, 'técnico')));
    else
      select count(*) into v_qtd from os_anexos
       where os_id = o.id and tipo::text like 'foto%' and criado_em > now() - interval '15 minutes'
         and enviado_por not in (select id from usuarios where papel in ('supervisor', 'admin'));
      update alertas set mensagem = format('%s novas fotos na O.S. #%s (%s), enviadas por %s', greatest(v_qtd, 2), o.numero, o.titulo, coalesce(v_nome, 'técnico'))
       where id = v_alerta;
    end if;
  end loop;
  return new;
end $$;

create trigger os_anexos_avisar_foto after insert on os_anexos
  for each row when (new.os_id is not null and new.tipo::text like 'foto%') execute function os_anexo_avisar_foto();
