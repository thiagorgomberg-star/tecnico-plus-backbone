-- Ao incluir um técnico de apoio (pelo app do responsável ou pelo painel), o apoio recebe um alerta com alarme.
-- Auxiliar fica de fora: ele entra sozinho como apoio quando o técnico dele inicia a O.S. e já está junto.
-- O apoio não abre a O.S. no app (só o responsável), por isso o endereço vai na própria mensagem.
create function os_apoio_avisar() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_os ordens_servico;
  v_resp text;
begin
  if exists (select 1 from usuarios where id = new.tecnico_id and papel = 'auxiliar') then return new; end if;
  select * into v_os from ordens_servico where id = new.os_id;
  select nome into v_resp from usuarios where id = v_os.tecnico_id;
  insert into alertas (tipo, usuario_id, os_id, mensagem)
  values ('apoio_os', new.tecnico_id, null,
          format('Você é apoio na O.S. #%s (%s) com %s. Local: %s',
                 v_os.numero, v_os.titulo, coalesce(v_resp, 'o técnico responsável'), coalesce(v_os.endereco, 'ver com o responsável')));
  return new;
end;
$$;

create trigger os_tecnicos_apoio_avisar
  after insert on os_tecnicos_apoio
  for each row execute function os_apoio_avisar();
