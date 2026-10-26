-- Erros do app (JS) enviados sozinhos pelo celular, para corrigir sem precisar de print do técnico.
create table app_erros (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references usuarios (id) default auth.uid(),
  mensagem text not null,
  pilha text,
  fatal boolean not null default false,
  versao text,
  aparelho text,
  criado_em timestamptz not null default now()
);
create index app_erros_data_idx on app_erros (criado_em desc);

alter table app_erros enable row level security;
create policy app_erros_inserir on app_erros for insert to authenticated with check (usuario_id = auth.uid());
create policy app_erros_supervisor_ler on app_erros for select to authenticated using (eh_supervisor());
