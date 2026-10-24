-- O técnico pode abrir e iniciar uma preventiva pelo próprio app (também offline).
-- Ela já nasce em execução, atribuída a ele; o resto do fluxo (fotos, conclusão, baixa) é o mesmo.

alter table ordens_servico add column rota_id uuid references rotas (id);
create index ordens_servico_rota_idx on ordens_servico (rota_id);

create policy os_tecnico_abre_preventiva on ordens_servico for insert to authenticated
  with check (
    tecnico_id = auth.uid()
    and criada_por = auth.uid()
    and tipo in ('Preventiva', 'Preventiva site')
    and status = 'em_execucao'
  );

-- Quem cria já em execução pulou envio e aceite: essas etapas ficam com a hora do início.
create or replace function os_preenche_datas() returns trigger
language plpgsql set search_path = public
as $$
begin
  new.atualizado_em := now();
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
