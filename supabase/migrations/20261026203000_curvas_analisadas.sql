-- Curvas .SOR que o supervisor abriu do computador em "Analisar curva OTDR": ficam guardadas para abrir de novo.
-- Arquivo no bucket "curvas" em analises/<id>-<nome>.
create table curvas_analisadas (
  id uuid primary key default gen_random_uuid(),
  nome_arquivo text not null,
  caminho_arquivo text not null,
  tamanho_bytes bigint,
  rota_id uuid references rotas (id) on delete set null,
  comprimento_km numeric,
  perda_total_db numeric,
  criticos int,
  atencao int,
  analisado_por uuid not null references usuarios (id) default auth.uid(),
  criado_em timestamptz not null default now()
);
create index curvas_analisadas_data_idx on curvas_analisadas (criado_em desc);

alter table curvas_analisadas enable row level security;
create policy curvas_analisadas_supervisor on curvas_analisadas for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());
