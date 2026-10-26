-- Ocorrência informada por técnico e correção de vistoria não têm SLA de 4h:
-- mostram só a idade (24h verde, 48h amarelo, 72h vermelho). Com cliente informado, vale o SLA do cliente.
create or replace function public.os_preenche_datas()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  new.atualizado_em := now();
  -- A reabertura grava as datas ela mesma (mantém a conclusão original ao reabrir para edição).
  if current_setting('app.reabrir_os', true) = 'sim' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.sla_limite := case when new.informado_por is null and new.origem_ponto_id is null
                           then coalesce(new.criado_em, now()) + sla_os() end;
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
$function$;

create or replace function public.recalcular_sla_os(p_os uuid)
 returns timestamp with time zone
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_horas numeric;
  v_limite timestamptz;
begin
  if not eh_supervisor() then raise exception 'Só o supervisor altera os clientes da O.S.'; end if;
  select min(c.sla_horas) into v_horas from os_clientes oc join clientes c on c.id = oc.cliente_id where oc.os_id = p_os;
  update ordens_servico
     set sla_limite = case
           when v_horas is not null then criado_em + make_interval(secs => v_horas * 3600)
           when informado_por is not null or origem_ponto_id is not null then null
           else criado_em + sla_os() end
   where id = p_os
   returning sla_limite into v_limite;
  return v_limite;
end $function$;

update ordens_servico o set sla_limite = null
 where (o.informado_por is not null or o.origem_ponto_id is not null)
   and not exists (select 1 from os_clientes oc where oc.os_id = o.id);
