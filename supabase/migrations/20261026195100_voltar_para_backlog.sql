-- Supervisor força a volta de uma O.S. em andamento para o backlog geral (sem técnico).
-- O técnico (e o apoio) perdem a O.S. e recebem um aviso com o motivo. Só supervisor.
-- O painel tira os técnicos de apoio logo depois (exclusões ficam no código, não nas migrações).
create or replace function voltar_para_backlog(p_os uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  o ordens_servico%rowtype;
begin
  if not eh_supervisor() then
    raise exception 'Somente o supervisor pode devolver uma O.S. ao backlog';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo';
  end if;
  select * into o from ordens_servico where id = p_os for update;
  if not found then
    raise exception 'O.S. não encontrada';
  end if;
  if o.status not in ('enviada', 'aceita', 'em_execucao', 'pausada', 'devolvida') then
    raise exception 'Só dá para devolver ao backlog uma O.S. em andamento (está %)', o.status;
  end if;

  perform set_config('app.reabrir_os', 'sim', true);
  update ordens_servico
     set status = 'rascunho', tecnico_id = null, enviada_em = null, aceita_em = null, iniciada_em = null,
         continua_em = null, pausa_solicitada_em = null, pausa_motivo = null,
         observacao_supervisor = trim(p_motivo)
   where id = p_os;
  perform set_config('app.reabrir_os', '', true);

  update os_eventos set observacao = 'Devolvida ao backlog pelo supervisor: ' || trim(p_motivo)
   where id = (select max(id) from os_eventos where os_id = p_os);

  -- Avisa quem estava com a O.S. (sem link: ela não é mais dele)
  insert into alertas (tipo, usuario_id, mensagem)
  select 'os_retirada', u, format('A O.S. #%s (%s) foi retirada de você e voltou ao backlog. Motivo: %s', o.numero, o.titulo, trim(p_motivo))
    from (select o.tecnico_id u union select tecnico_id from os_tecnicos_apoio where os_id = p_os) x
   where u is not null;
end;
$$;
revoke all on function voltar_para_backlog(uuid, text) from public, anon;
grant execute on function voltar_para_backlog(uuid, text) to authenticated;
