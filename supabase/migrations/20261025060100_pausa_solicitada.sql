-- O técnico solicita pausar uma O.S. em execução (com motivo); o supervisor autoriza
-- remanejando para outro técnico, devolvendo ao backlog ou deixando com o técnico para depois.
alter table ordens_servico
  add column pausa_solicitada_em timestamptz,
  add column pausa_motivo text;

create function os_avisa_pausa() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.pausa_solicitada_em is not null and old.pausa_solicitada_em is null then
    insert into alertas (tipo, usuario_id, os_id, mensagem)
    select 'pausa_solicitada', u.id, new.id,
           format('%s pede pausa na O.S. #%s: %s',
                  coalesce((select nome from usuarios where id = new.tecnico_id), 'Técnico'), new.numero,
                  coalesce(new.pausa_motivo, 'sem motivo informado'))
      from usuarios u
     where u.ativo and u.papel in ('supervisor', 'admin');
  end if;
  -- Saiu de execução (autorizado pelo supervisor): a solicitação está resolvida.
  if new.status is distinct from old.status and new.status not in ('em_execucao', 'pausada') then
    new.pausa_solicitada_em := null;
    new.pausa_motivo := null;
  end if;
  return new;
end;
$$;

create trigger os_avisa_pausa before update on ordens_servico
  for each row execute function os_avisa_pausa();
