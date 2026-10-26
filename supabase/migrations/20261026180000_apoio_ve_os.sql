-- Técnico de apoio vê a O.S. inteira (igual ao responsável) e pode tirar fotos e lançar o que executou.
-- Mudar status, assinar e localizar o evento continuam só com o técnico responsável.

-- Função com permissão própria: as regras de ordens_servico e de os_tecnicos_apoio consultam uma à outra.
create function eh_apoio_da_os(p_os uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from os_tecnicos_apoio a where a.os_id = p_os and a.tecnico_id = auth.uid());
$$;

create function eh_apoio_da_os_texto(p_os text) returns boolean
language sql stable security definer set search_path = public
as $$
  select p_os ~ '^[0-9a-f-]{36}$' and eh_apoio_da_os(p_os::uuid);
$$;

revoke execute on function eh_apoio_da_os(uuid), eh_apoio_da_os_texto(text) from public, anon;
grant execute on function eh_apoio_da_os(uuid), eh_apoio_da_os_texto(text) to authenticated;

alter policy os_ler on ordens_servico
  using (
    eh_supervisor()
    or (
      (tecnico_id = auth.uid() or eh_apoio_da_os(id))
      and status <> 'rascunho'
      and (status not in ('baixada', 'cancelada') or atualizado_em >= now() - interval '7 days')
    )
  );

alter policy os_anexos_ler on os_anexos
  using (eh_supervisor() or informou_os(os_id, false) or eh_apoio_da_os(os_id)
         or exists (select 1 from ordens_servico o where o.id = os_anexos.os_id and o.tecnico_id = auth.uid()));

alter policy os_anexos_inserir on os_anexos
  with check (enviado_por = auth.uid() and (eh_supervisor() or informou_os(os_id, true) or eh_apoio_da_os(os_id)
              or exists (select 1 from ordens_servico o where o.id = os_anexos.os_id and o.tecnico_id = auth.uid())));

alter policy os_eventos_ler on os_eventos
  using (eh_supervisor() or eh_apoio_da_os(os_id)
         or exists (select 1 from ordens_servico o where o.id = os_eventos.os_id and o.tecnico_id = auth.uid()));

alter policy servicos_ler on os_servicos_executados
  using (eh_supervisor() or eh_apoio_da_os(os_id)
         or exists (select 1 from ordens_servico o where o.id = os_servicos_executados.os_id and o.tecnico_id = auth.uid()));

-- os_em_campo_comigo já cobre responsável e apoio com a O.S. em campo.
alter policy servicos_tecnico_lanca on os_servicos_executados
  with check (lancado_por = auth.uid() and os_em_campo_comigo(os_id));

alter policy servicos_tecnico_remove on os_servicos_executados
  using (lancado_por = auth.uid() and os_em_campo_comigo(os_id));

alter policy os_anexos_storage_ler on storage.objects
  using (bucket_id = 'os-anexos' and (eh_supervisor() or informou_os_texto((storage.foldername(name))[1], false)
         or eh_apoio_da_os_texto((storage.foldername(name))[1])
         or exists (select 1 from ordens_servico o where o.id::text = (storage.foldername(objects.name))[1] and o.tecnico_id = auth.uid())));

alter policy os_anexos_storage_enviar on storage.objects
  with check (bucket_id = 'os-anexos' and (eh_supervisor() or informou_os_texto((storage.foldername(name))[1], true)
              or eh_apoio_da_os_texto((storage.foldername(name))[1])
              or exists (select 1 from ordens_servico o where o.id::text = (storage.foldername(objects.name))[1] and o.tecnico_id = auth.uid())));

-- Fotos de referência (abertura) também para o apoio.
create or replace function fotos_referencia(p_os uuid)
returns table (id uuid, caminho_arquivo text, criado_em timestamptz)
language sql stable security definer set search_path = public
as $$
  select a.id, a.caminho_arquivo, a.criado_em
    from ordens_servico o
    join os_anexos a on (a.ponto_id = o.origem_ponto_id)
                     or (o.informado_por is not null and a.os_id = o.id and a.enviado_por = o.informado_por and a.tipo = 'foto_antes')
   where o.id = p_os and (o.tecnico_id = auth.uid() or o.informado_por = auth.uid() or eh_supervisor() or ve_backlog(o.id) or eh_apoio_da_os(o.id))
   order by a.criado_em;
$$;

-- O aviso do apoio agora aponta para a O.S.: tocar na notificação abre a O.S. completa.
create or replace function os_apoio_avisar() returns trigger
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
  values ('apoio_os', new.tecnico_id, new.os_id,
          format('Você é apoio na O.S. #%s (%s) com %s. Local: %s',
                 v_os.numero, v_os.titulo, coalesce(v_resp, 'o técnico responsável'), coalesce(v_os.endereco, 'ver com o responsável')));
  return new;
end;
$$;
