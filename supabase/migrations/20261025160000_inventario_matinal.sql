-- Inventário Matinal de ferramentas e EPI (ciclo 30 dias).
-- O supervisor cadastra o que foi liberado a cada técnico; o técnico fotografa cada item ao menos uma vez a cada 30 dias.
-- Fotos no bucket "inventario": pasta = id do técnico.

create table ferramentas (
  id uuid primary key default gen_random_uuid(),
  tecnico_id uuid not null references usuarios (id),
  categoria text not null default 'ferramenta' check (categoria in ('ferramenta', 'epi')),
  nome text not null,
  marca_modelo text,
  numero_serie text,
  patrimonio text,
  validade date, -- EPI (CA) ou calibração
  liberada_em date not null default current_date,
  situacao text not null default 'ativa' check (situacao in ('ativa', 'devolvida', 'baixada')),
  observacao text,
  criado_por uuid references usuarios (id) default auth.uid(),
  criado_em timestamptz not null default now()
);
create index ferramentas_tecnico_idx on ferramentas (tecnico_id) where situacao = 'ativa';

create table inventario_inspecoes (
  id uuid primary key default gen_random_uuid(),
  ferramenta_id uuid not null references ferramentas (id) on delete cascade,
  tecnico_id uuid not null references usuarios (id) default auth.uid(),
  feita_em timestamptz not null default now(),
  condicao text not null default 'ok' check (condicao in ('ok', 'avariada', 'faltando')),
  observacao text,
  foto text, -- caminho no bucket "inventario"
  posicao extensions.geography(point, 4326),
  criado_em timestamptz not null default now()
);
create index inventario_inspecoes_ferramenta_idx on inventario_inspecoes (ferramenta_id, feita_em desc);

alter table ferramentas enable row level security;
alter table inventario_inspecoes enable row level security;

create policy ferramentas_supervisor on ferramentas for all to authenticated using (eh_supervisor()) with check (eh_supervisor());
create policy ferramentas_tecnico_ler on ferramentas for select to authenticated using (tecnico_id = auth.uid());

create policy inspecoes_supervisor on inventario_inspecoes for all to authenticated using (eh_supervisor()) with check (eh_supervisor());
create policy inspecoes_tecnico_ler on inventario_inspecoes for select to authenticated using (tecnico_id = auth.uid());
create policy inspecoes_tecnico_registrar on inventario_inspecoes for insert to authenticated
  with check (tecnico_id = auth.uid() and exists (select 1 from ferramentas f where f.id = ferramenta_id and f.tecnico_id = auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inventario', 'inventario', false, 10 * 1024 * 1024, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy inventario_storage_ler on storage.objects for select to authenticated
  using (bucket_id = 'inventario' and (public.eh_supervisor() or (storage.foldername(name))[1] = auth.uid()::text));
create policy inventario_storage_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'inventario' and (storage.foldername(name))[1] = auth.uid()::text);

-- Situação de cada item ativo: última inspeção e quando vence o ciclo de 30 dias.
create view inventario_situacao with (security_invoker = true) as
select f.*, u.nome as tecnico,
  i.feita_em as ultima_inspecao, i.condicao as ultima_condicao, i.foto as ultima_foto, i.observacao as ultima_observacao,
  (coalesce(i.feita_em, f.criado_em) + interval '30 days') as proxima_ate,
  case when i.feita_em is null then 'pendente'
       when i.feita_em + interval '30 days' < now() then 'vencida'
       when i.feita_em + interval '25 days' < now() then 'vence_em_breve'
       else 'em_dia' end as ciclo
from ferramentas f
join usuarios u on u.id = f.tecnico_id
left join lateral (
  select x.feita_em, x.condicao, x.foto, x.observacao from inventario_inspecoes x
  where x.ferramenta_id = f.id order by x.feita_em desc limit 1
) i on true
where f.situacao = 'ativa';

alter publication supabase_realtime add table inventario_inspecoes;
