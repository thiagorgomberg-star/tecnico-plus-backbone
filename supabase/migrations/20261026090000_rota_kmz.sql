-- KMZ de cada rota usado para localizar rompimento: o arquivo fica no bucket "kmz" e o traçado já lido
-- (caminho do cabo simplificado + pontos) fica em jsonb, para o app baixar pouco e usar sem sinal.
create table if not exists rota_kmz (
  id uuid primary key default gen_random_uuid(),
  rota_id uuid not null references rotas (id) on delete cascade,
  nome_arquivo text not null,
  caminho_arquivo text,
  tracado jsonb not null,
  extensao_m numeric,
  enviado_por uuid not null references usuarios (id) default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists rota_kmz_rota_idx on rota_kmz (rota_id, criado_em desc);

alter table rota_kmz enable row level security;
create policy rota_kmz_ler on rota_kmz for select to authenticated using (true);
create policy rota_kmz_inserir on rota_kmz for insert to authenticated with check (enviado_por = auth.uid());
create policy rota_kmz_apagar on rota_kmz for delete to authenticated using (enviado_por = auth.uid() or eh_supervisor());

insert into storage.buckets (id, name, public, file_size_limit)
values ('kmz', 'kmz', false, 30 * 1024 * 1024)
on conflict (id) do nothing;

create policy kmz_storage_ler on storage.objects for select to authenticated using (bucket_id = 'kmz');
create policy kmz_storage_enviar on storage.objects for insert to authenticated with check (bucket_id = 'kmz');
