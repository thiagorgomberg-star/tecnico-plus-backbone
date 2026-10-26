-- Situação da fila de envio de cada celular (o app atualiza a cada sincronização), para o supervisor ver fila travada.
create table fila_status (
  usuario_id uuid primary key references usuarios (id) default auth.uid(),
  pendentes int not null default 0,
  fotos int not null default 0,
  recusados int not null default 0,
  mais_antigo timestamptz,
  ultimo_erro text,
  segurando_wifi boolean not null default false,
  atualizado_em timestamptz not null default now()
);

alter table fila_status enable row level security;
create policy fila_status_proprio on fila_status for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy fila_status_supervisor_ler on fila_status for select to authenticated using (eh_supervisor());
