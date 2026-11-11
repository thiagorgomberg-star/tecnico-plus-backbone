-- Parecer do analista (supervisor) sobre uma curva OTDR ou um comparativo: comentários por evento, fotos
-- (ex.: potência da fibra), parecer geral e recomendação. A chave identifica a curva ou o par comparado.
create table if not exists pareceres_curva (
  chave text primary key,
  titulo text,
  eventos jsonb not null default '[]'::jsonb,
  fotos jsonb not null default '[]'::jsonb,
  parecer text not null default '',
  recomendacao text not null default '',
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id) default auth.uid()
);
alter table pareceres_curva enable row level security;
create policy pareceres_curva_ler on pareceres_curva for select to authenticated using (true);
create policy pareceres_curva_inserir on pareceres_curva for insert to authenticated with check (eh_supervisor());
create policy pareceres_curva_alterar on pareceres_curva for update to authenticated using (eh_supervisor()) with check (eh_supervisor());

insert into storage.buckets (id, name, public, file_size_limit)
values ('pareceres', 'pareceres', false, 15 * 1024 * 1024)
on conflict (id) do nothing;

create policy pareceres_storage_ler on storage.objects for select to authenticated using (bucket_id = 'pareceres');
create policy pareceres_storage_enviar on storage.objects for insert to authenticated with check (bucket_id = 'pareceres' and eh_supervisor());
