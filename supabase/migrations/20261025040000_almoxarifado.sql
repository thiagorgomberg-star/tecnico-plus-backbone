-- Almoxarifado backbone: entrada no estoque central, liberação para o técnico,
-- devolução e consumo. O consumo é lançado sozinho quando o técnico registra
-- um material utilizado na O.S. (e some se o lançamento for removido).

create table estoque_movimentos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references itens_execucao (id),
  tipo text not null check (tipo in ('entrada', 'liberacao', 'devolucao', 'consumo', 'ajuste')),
  quantidade numeric(12, 2) not null check (quantidade <> 0),
  tecnico_id uuid references usuarios (id),
  os_id uuid references ordens_servico (id) on delete set null,
  lancamento_id uuid references os_servicos_executados (id) on delete cascade,
  observacao text,
  criado_por uuid references usuarios (id) default auth.uid(),
  criado_em timestamptz not null default now(),
  check (tipo in ('entrada', 'ajuste') or tecnico_id is not null),
  check (tipo = 'ajuste' or quantidade > 0)
);

create index estoque_movimentos_item_idx on estoque_movimentos (item_id);
create index estoque_movimentos_tecnico_idx on estoque_movimentos (tecnico_id, item_id);

alter table estoque_movimentos enable row level security;

create policy estoque_ler on estoque_movimentos for select to authenticated
  using (eh_supervisor() or tecnico_id = auth.uid());
create policy estoque_supervisor on estoque_movimentos for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());

-- Saldo do almoxarifado central por item (ajuste sem técnico mexe no central).
create view saldo_almoxarifado with (security_invoker = true) as
select
  i.id as item_id, i.nome, i.unidade, i.ativo,
  coalesce(sum(case m.tipo
    when 'entrada' then m.quantidade
    when 'liberacao' then -m.quantidade
    when 'devolucao' then m.quantidade
    when 'ajuste' then case when m.tecnico_id is null then m.quantidade else 0 end
    else 0 end), 0) as saldo
from itens_execucao i
left join estoque_movimentos m on m.item_id = i.id
where i.categoria = 'material'
group by i.id;

-- Saldo em poder de cada técnico por item.
create view saldo_tecnicos with (security_invoker = true) as
select
  m.tecnico_id, u.nome as tecnico, m.item_id, i.nome, i.unidade,
  sum(case m.tipo
    when 'liberacao' then m.quantidade
    when 'devolucao' then -m.quantidade
    when 'consumo' then -m.quantidade
    when 'ajuste' then m.quantidade
    else 0 end) as saldo
from estoque_movimentos m
join itens_execucao i on i.id = m.item_id
join usuarios u on u.id = m.tecnico_id
where m.tecnico_id is not null
group by m.tecnico_id, u.nome, m.item_id, i.nome, i.unidade;

-- Material lançado na O.S. vira consumo do técnico que lançou.
create function os_consumo_material() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from itens_execucao where id = new.item_id and categoria = 'material') then
    insert into estoque_movimentos (item_id, tipo, quantidade, tecnico_id, os_id, lancamento_id, criado_por)
    values (new.item_id, 'consumo', new.quantidade,
            coalesce((select tecnico_id from ordens_servico where id = new.os_id), new.lancado_por),
            new.os_id, new.id, new.lancado_por);
  end if;
  return null;
end;
$$;

create trigger os_consumo_material after insert on os_servicos_executados
  for each row execute function os_consumo_material();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table estoque_movimentos;
  end if;
end $$;
