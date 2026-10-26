-- Clientes atendidos (operadoras etc.), cada um com o próprio SLA. Um evento (O.S.) pode atender um ou mais clientes,
-- cada um com o próprio ticket e texto de acionamento. O SLA da O.S. passa a ser o menor SLA entre os clientes dela.
create table clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  sla_horas numeric not null default 4 check (sla_horas > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table clientes enable row level security;
create policy clientes_ler on clientes for select to authenticated using (true);
create policy clientes_supervisor on clientes for all to authenticated using (eh_supervisor()) with check (eh_supervisor());

create table os_clientes (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references ordens_servico (id) on delete cascade,
  cliente_id uuid not null references clientes (id),
  ticket text,
  texto_acionamento text,
  criado_em timestamptz not null default now()
);
create index os_clientes_os_idx on os_clientes (os_id);
alter table os_clientes enable row level security;
-- Quem vê a O.S. (RLS de ordens_servico) vê os clientes dela; só o supervisor altera.
create policy os_clientes_ler on os_clientes for select to authenticated
  using (exists (select 1 from ordens_servico o where o.id = os_id));
create policy os_clientes_supervisor on os_clientes for all to authenticated using (eh_supervisor()) with check (eh_supervisor());

-- Recalcula o SLA da O.S. pelo menor SLA dos clientes (sem cliente: o SLA padrão de 4h). O painel chama ao salvar os clientes.
create or replace function recalcular_sla_os(p_os uuid) returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  v_horas numeric;
  v_limite timestamptz;
begin
  if not eh_supervisor() then raise exception 'Só o supervisor altera os clientes da O.S.'; end if;
  select min(c.sla_horas) into v_horas from os_clientes oc join clientes c on c.id = oc.cliente_id where oc.os_id = p_os;
  update ordens_servico
     set sla_limite = criado_em + coalesce(make_interval(secs => v_horas * 3600), sla_os())
   where id = p_os
   returning sla_limite into v_limite;
  return v_limite;
end $$;
revoke execute on function recalcular_sla_os(uuid) from public, anon;
grant execute on function recalcular_sla_os(uuid) to authenticated;
