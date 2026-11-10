-- Traçado do backbone (KMZ geral simplificado) para desenhar no mapa do console de despacho.
create table if not exists rede_backbone (
  id smallint primary key default 1 check (id = 1),
  nome_arquivo text,
  linhas jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
alter table rede_backbone enable row level security;
create policy rede_backbone_ler on rede_backbone for select to authenticated using (true);
create policy rede_backbone_inserir on rede_backbone for insert to authenticated with check (eh_supervisor());
create policy rede_backbone_alterar on rede_backbone for update to authenticated using (eh_supervisor()) with check (eh_supervisor());
