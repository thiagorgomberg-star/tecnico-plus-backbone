-- SLA de 4 horas de execução contado a partir do envio da O.S. ao técnico,
-- com alertas automáticos quando faltar 1 hora e quando vencer.

alter table ordens_servico add column sla_limite timestamptz;
create index ordens_servico_sla_idx on ordens_servico (sla_limite) where status not in ('concluida', 'baixada', 'cancelada');

create function sla_os() returns interval
language sql immutable set search_path = public
as $$ select interval '4 hours' $$;

create or replace function os_preenche_datas() returns trigger
language plpgsql set search_path = public
as $$
begin
  new.atualizado_em := now();
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  -- O app manda a hora real da ação no campo da etapa; sem isso vale a hora do servidor.
  -- Nenhuma etapa fica antes da anterior.
  case new.status
    when 'enviada' then
      new.enviada_em := coalesce(new.enviada_em, now());
      new.sla_limite := new.enviada_em + sla_os();
    when 'aceita' then new.aceita_em := greatest(hora_do_celular(new.aceita_em), new.enviada_em);
    when 'em_execucao' then
      if tg_op = 'INSERT' or old.status <> 'pausada' then
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

-- Schema fora da API: funções que só o agendador do banco chama.
create schema if not exists interno;

-- Cria os alertas de SLA uma única vez por O.S. (técnico e supervisores ativos).
create function interno.gerar_alertas_sla() returns integer
language plpgsql security definer set search_path = public
as $$
declare
  criados integer := 0;
  n integer;
begin
  insert into alertas (tipo, usuario_id, os_id, mensagem)
  select 'prazo_proximo', o.tecnico_id, o.id,
         format('O.S. #%s vence o SLA às %s', o.numero, to_char(o.sla_limite at time zone 'America/Sao_Paulo', 'HH24:MI'))
    from ordens_servico o
   where o.status in ('enviada', 'aceita', 'em_execucao', 'pausada', 'devolvida')
     and o.sla_limite between now() and now() + interval '1 hour'
     and o.tecnico_id is not null
     and not exists (select 1 from alertas a where a.os_id = o.id and a.tipo = 'prazo_proximo');
  get diagnostics n = row_count;
  criados := criados + n;

  insert into alertas (tipo, usuario_id, os_id, mensagem)
  select 'os_atrasada', u.id, o.id, format('O.S. #%s passou do SLA de 4 horas', o.numero)
    from ordens_servico o
    join usuarios u on u.ativo and (u.id = o.tecnico_id or u.papel in ('supervisor', 'admin'))
   where o.status in ('enviada', 'aceita', 'em_execucao', 'pausada', 'devolvida')
     and o.sla_limite < now()
     and not exists (select 1 from alertas a where a.os_id = o.id and a.tipo = 'os_atrasada' and a.usuario_id = u.id);
  get diagnostics n = row_count;
  return criados + n;
end;
$$;

create extension if not exists pg_cron;
select cron.schedule('alertas-sla', '*/5 * * * *', 'select interno.gerar_alertas_sla()');
