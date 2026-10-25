-- O técnico cadastra em campo um serviço ou material que não está na lista (nome em CAIXA ALTA).
-- O item já pode ser lançado na O.S., mas fica "aguardando aprovação" até o supervisor aprovar no painel.
alter table itens_execucao add column if not exists aprovado boolean not null default true;
alter table itens_execucao add column if not exists sugerido_por uuid references usuarios (id);
alter table itens_execucao add column if not exists sugerido_em timestamptz;
alter table itens_execucao add column if not exists sugerido_os uuid references ordens_servico (id) on delete set null;

create or replace function sugerir_item(p_id uuid, p_nome text, p_unidade text, p_categoria text, p_os uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from usuarios where id = auth.uid() and ativo) then
    raise exception 'Usuário sem permissão';
  end if;
  if coalesce(trim(p_nome), '') = '' or p_categoria not in ('servico', 'material') then
    raise exception 'Informe o nome e se é serviço ou material';
  end if;
  insert into itens_execucao (id, nome, unidade, categoria, ordem, aprovado, sugerido_por, sugerido_em, sugerido_os)
  values (p_id, upper(trim(p_nome)), coalesce(nullif(lower(trim(p_unidade)), ''), 'un'), p_categoria, 999, false,
          auth.uid(), now(), p_os)
  on conflict do nothing;
  -- Mesmo nome cadastrado por outro técnico ao mesmo tempo: entra com um sufixo para o lançamento da O.S. não se perder
  -- (o supervisor junta ou renomeia na aprovação).
  if not found and not exists (select 1 from itens_execucao where id = p_id) then
    insert into itens_execucao (id, nome, unidade, categoria, ordem, aprovado, sugerido_por, sugerido_em, sugerido_os)
    values (p_id, upper(trim(p_nome)) || ' #' || left(p_id::text, 4), coalesce(nullif(lower(trim(p_unidade)), ''), 'un'),
            p_categoria, 999, false, auth.uid(), now(), p_os);
  end if;
end;
$$;
revoke all on function sugerir_item(uuid, text, text, text, uuid) from public, anon;
grant execute on function sugerir_item(uuid, text, text, text, uuid) to authenticated;
