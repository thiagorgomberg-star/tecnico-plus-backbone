-- Centro de custo por contrato (cliente): equipes alocadas em cada contrato e custos mensais de cada equipe.
-- Equipe = técnico + auxiliares dele (usuarios.tecnico_responsavel_id). O rateio é calculado no painel (aba Produção).

-- Quanto do tempo/custo da equipe vai para o contrato. Equipe em mais de um contrato: o custo é dividido
-- na proporção destes percentuais.
create table if not exists contrato_equipes (
  cliente_id uuid not null references clientes (id) on delete cascade,
  tecnico_id uuid not null references usuarios (id) on delete cascade,
  percentual numeric(5, 2) not null default 100 check (percentual > 0 and percentual <= 100),
  primary key (cliente_id, tecnico_id)
);
alter table contrato_equipes enable row level security;
create policy contrato_equipes_supervisor on contrato_equipes for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());

-- Custos do mês digitados pelo supervisor. tecnico_id nulo = custo geral, rateado pela receita dos contratos.
-- Despesas aprovadas e manutenção de veículo entram sozinhas no cálculo; aqui vai o que não está no sistema
-- (folha de pagamento, compra de ferramental, aluguel/parcela de veículo...).
create table if not exists custos_mensais (
  id uuid primary key default gen_random_uuid(),
  mes date not null check (extract(day from mes) = 1),
  tecnico_id uuid references usuarios (id) on delete cascade,
  categoria text not null check (categoria in ('folha', 'ferramental', 'frota', 'outros')),
  valor numeric(14, 2) not null check (valor >= 0),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists custos_mensais_unico
  on custos_mensais (mes, coalesce(tecnico_id, '00000000-0000-0000-0000-000000000000'::uuid), categoria);
alter table custos_mensais enable row level security;
create policy custos_mensais_supervisor on custos_mensais for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());
