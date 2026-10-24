-- Link do relatório do evento para parceiros (sem login). O token é longo e aleatório,
-- vale 30 dias e o supervisor pode revogar. Quem lê os dados é a função relatorio-os.
create table os_relatorios_compartilhados (
  token text primary key default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  os_id uuid not null references ordens_servico (id) on delete cascade,
  criado_por uuid not null references usuarios (id) default auth.uid(),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '30 days',
  revogado boolean not null default false
);

create index os_relatorios_os_idx on os_relatorios_compartilhados (os_id);

alter table os_relatorios_compartilhados enable row level security;
create policy relatorios_supervisor on os_relatorios_compartilhados for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());
