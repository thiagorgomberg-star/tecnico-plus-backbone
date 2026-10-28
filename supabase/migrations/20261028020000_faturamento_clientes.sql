-- Faturamento mensal cobrado de cada cliente (lançado pelo supervisor na aba Produção).
-- A parte de cada técnico é calculada no painel pela proporção de O.S. concluídas do cliente no mês.
create table if not exists faturamento_clientes (
  mes date not null check (extract(day from mes) = 1),
  cliente_id uuid not null references clientes (id),
  valor numeric(14, 2) not null check (valor >= 0),
  observacao text,
  atualizado_em timestamptz not null default now(),
  primary key (mes, cliente_id)
);
alter table faturamento_clientes enable row level security;
create policy faturamento_supervisor on faturamento_clientes for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());
