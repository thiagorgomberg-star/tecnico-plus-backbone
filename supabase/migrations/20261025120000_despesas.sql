-- Despesas de campo lançadas pelo técnico (combustível, pedágio, ferramenta...), com foto do comprovante.
-- O supervisor confere no painel, aprova ou recusa e exporta para planilha.
-- Comprovantes no bucket "despesas": pasta = id do técnico.

create table despesas (
  id uuid primary key default gen_random_uuid(),
  tecnico_id uuid not null references usuarios (id) default auth.uid(),
  data date not null default current_date,
  categoria text not null check (categoria in
    ('combustivel', 'pedagio', 'estacionamento', 'alimentacao', 'hospedagem', 'ferramenta', 'material', 'manutencao_veiculo', 'outros')),
  valor numeric(10, 2) not null check (valor > 0),
  pagamento text not null default 'cartao_empresa' check (pagamento in ('cartao_empresa', 'reembolso', 'adiantamento')),
  fornecedor text, -- posto, loja, praça de pedágio
  descricao text,
  os_id uuid references ordens_servico (id) on delete set null,
  -- combustível
  placa text,
  litros numeric(7, 2) check (litros is null or litros > 0),
  odometro_km integer check (odometro_km is null or odometro_km >= 0),
  combustivel text check (combustivel is null or combustivel in ('gasolina', 'etanol', 'diesel', 'gnv')),
  -- comprovante e local
  comprovante text, -- caminho no bucket "despesas"
  posicao extensions.geography(point, 4326),
  -- conferência
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada')),
  conferida_por uuid references usuarios (id),
  conferida_em timestamptz,
  motivo_recusa text,
  criado_em timestamptz not null default now(),
  check (categoria <> 'combustivel' or (litros is not null and odometro_km is not null and placa is not null))
);
create index despesas_tecnico_data_idx on despesas (tecnico_id, data desc);
create index despesas_data_idx on despesas (data desc);

alter table despesas enable row level security;

create policy despesas_supervisor on despesas for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());
create policy despesas_tecnico_ler on despesas for select to authenticated
  using (tecnico_id = auth.uid());
create policy despesas_tecnico_lancar on despesas for insert to authenticated
  with check (tecnico_id = auth.uid() and status = 'pendente' and conferida_por is null);
-- O técnico corrige ou apaga só o que ainda não foi conferido (ou foi recusado, para reenviar).
create policy despesas_tecnico_corrigir on despesas for update to authenticated
  using (tecnico_id = auth.uid() and status in ('pendente', 'recusada'))
  with check (tecnico_id = auth.uid() and status = 'pendente' and conferida_por is null);
create policy despesas_tecnico_apagar on despesas for delete to authenticated
  using (tecnico_id = auth.uid() and status = 'pendente');

-- Ao corrigir uma recusada, volta para conferência.
create or replace function despesa_reabrir() returns trigger
language plpgsql set search_path = public
as $$
begin
  if not eh_supervisor() then
    new.conferida_em := null;
    new.motivo_recusa := null;
  end if;
  return new;
end $$;
create trigger despesas_reabrir before update on despesas
  for each row execute function despesa_reabrir();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('despesas', 'despesas', false, 10 * 1024 * 1024, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

create policy despesas_storage_ler on storage.objects for select to authenticated
  using (bucket_id = 'despesas' and (public.eh_supervisor() or (storage.foldername(name))[1] = auth.uid()::text));
create policy despesas_storage_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'despesas' and (storage.foldername(name))[1] = auth.uid()::text);

-- Planilha de conferência: uma linha por despesa, com km rodado e consumo desde o abastecimento anterior da mesma placa.
create view despesas_planilha with (security_invoker = true) as
select
  d.*,
  u.nome as tecnico,
  o.numero as os_numero,
  c.nome as conferida_por_nome,
  extensions.st_y(d.posicao::extensions.geometry) as latitude,
  extensions.st_x(d.posicao::extensions.geometry) as longitude,
  case when d.categoria = 'combustivel' then
    d.odometro_km - lag(d.odometro_km) over w end as km_rodados,
  case when d.categoria = 'combustivel' and d.litros > 0 then
    round(((d.odometro_km - lag(d.odometro_km) over w) / d.litros)::numeric, 2) end as km_por_litro,
  case when d.categoria = 'combustivel' and d.litros > 0 then round(d.valor / d.litros, 3) end as preco_litro
from despesas d
join usuarios u on u.id = d.tecnico_id
left join ordens_servico o on o.id = d.os_id
left join usuarios c on c.id = d.conferida_por
window w as (partition by d.categoria, upper(replace(d.placa, '-', '')) order by d.odometro_km, d.data, d.criado_em);
