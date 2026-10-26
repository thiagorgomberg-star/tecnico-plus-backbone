-- Km percorridos pelo técnico no expediente da O.S., pelo GPS, até a conclusão (ou até agora se ainda aberta).
-- Vai no relatório de atendimento (app, painel e link do parceiro).
-- Ruído do GPS parado não soma: ignora pontos imprecisos (> 50 m), trechos menores que 25 m e saltos acima de 180 km/h.
create function km_percorridos_os(p_os uuid)
returns table (km numeric, desde timestamptz, ate timestamptz)
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_os ordens_servico;
  v_exp expedientes;
  v_ate timestamptz;
begin
  select * into v_os from ordens_servico where id = p_os;
  if v_os.id is null or v_os.tecnico_id is null then return; end if;
  -- Chamada da edge function (chave de serviço) não tem auth.uid(); quem tem login precisa ser o técnico, apoio ou supervisor.
  if auth.uid() is not null and not eh_supervisor() and v_os.tecnico_id <> auth.uid()
     and not exists (select 1 from os_tecnicos_apoio a where a.os_id = p_os and a.tecnico_id = auth.uid()) then
    return;
  end if;

  v_ate := coalesce(v_os.concluida_em, now());
  select * into v_exp from expedientes e
   where e.tecnico_id = v_os.tecnico_id and e.inicio <= v_ate
   order by e.inicio desc limit 1;
  if v_exp.id is null then return; end if;
  v_ate := least(v_ate, coalesce(v_exp.fim, v_ate));

  return query
  with pts as (
    select registrado_em, posicao::geography as g
      from posicoes_gps
     where expediente_id = v_exp.id and registrado_em <= v_ate and coalesce(precisao_m, 0) <= 50
  ), seg as (
    select st_distance(g, lag(g) over w) as d,
           extract(epoch from registrado_em - lag(registrado_em) over w) as s
      from pts window w as (order by registrado_em)
  )
  select round((coalesce(sum(d) filter (where d >= 25 and (s <= 0 or d / nullif(s, 0) * 3.6 <= 180)), 0) / 1000)::numeric, 1),
         v_exp.inicio, v_ate
    from seg;
end;
$$;

revoke execute on function km_percorridos_os(uuid) from public, anon;
grant execute on function km_percorridos_os(uuid) to authenticated, service_role;
