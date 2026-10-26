-- Backlog programado para um dia: o supervisor escolhe a data (e, se quiser, o técnico e o horário).
-- Até o dia chegar a O.S. fica fora do backlog do app; no dia, a que tem técnico é enviada a ele
-- automaticamente (a partir das 06h, com o aviso de Nova O.S.) e a sem técnico aparece no backlog geral.

create or replace function interno.fim_de_hoje() returns timestamptz
language sql stable as $$
  select (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '1 day') at time zone 'America/Sao_Paulo'
$$;

create or replace function public.backlog_disponivel()
 returns table(id uuid, numero integer, tipo text, prioridade prioridade_os, titulo text, descricao text, endereco text, lat double precision, lng double precision, ticket_acionamento text, sla_limite timestamp with time zone, criado_em timestamp with time zone, reservada boolean)
 language sql
 stable security definer
 set search_path to 'public', 'extensions'
as $function$
  select o.id, o.numero, o.tipo, o.prioridade, o.titulo, o.descricao, o.endereco,
         st_y(o.local::geometry), st_x(o.local::geometry), o.ticket_acionamento, o.sla_limite, o.criado_em,
         o.tecnico_id = auth.uid()
    from ordens_servico o
   where o.status = 'rascunho'
     and (o.tecnico_id is null or o.tecnico_id = auth.uid())
     and (o.programada_inicio is null or o.programada_inicio < interno.fim_de_hoje())
     and exists (select 1 from usuarios u where u.id = auth.uid() and u.ativo)
   order by case o.prioridade when 'emergencia' then 0 when 'alta' then 1 when 'media' then 2 else 3 end, o.criado_em;
$function$;

create or replace function interno.despachar_programadas() returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- 06h de Brasília em diante: envia as O.S. programadas para hoje (ou atrasadas) que já têm técnico.
  if extract(hour from now() at time zone 'America/Sao_Paulo') < 6 then return; end if;
  perform set_config('app.assumir_backlog', 'sim', true);
  update ordens_servico set status = 'enviada'
   where status = 'rascunho' and tecnico_id is not null
     and programada_inicio is not null and programada_inicio < interno.fim_de_hoje();
  perform set_config('app.assumir_backlog', '', true);
end $$;

select cron.schedule('despachar-programadas', '*/15 * * * *', 'select interno.despachar_programadas()');
