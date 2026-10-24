-- Frota: veículos da base, vínculo com o técnico, manutenção/troca de óleo e abastecimentos.
-- Abastecimentos continuam sendo despesas de combustível (ligadas ao veículo pela placa).

create or replace function placa_normalizada(p text) returns text
language sql immutable as $$ select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) $$;

-- A tabela veiculos já existia desde o MVP (placa, modelo, consumo_km_l, odometro_km = km no cadastro, ativo).
alter table veiculos
  add column if not exists marca text,
  add column if not exists ano integer check (ano is null or ano between 1980 and 2100),
  add column if not exists cor text,
  add column if not exists combustivel text check (combustivel is null or combustivel in ('flex', 'gasolina', 'etanol', 'diesel', 'gnv')),
  add column if not exists renavam text,
  add column if not exists tecnico_id uuid references usuarios (id) on delete set null,
  add column if not exists oleo_intervalo_km integer not null default 10000 check (oleo_intervalo_km > 0),
  add column if not exists oleo_intervalo_dias integer not null default 180 check (oleo_intervalo_dias > 0),
  add column if not exists observacao text,
  add column if not exists criado_em timestamptz not null default now();
create unique index veiculos_placa_idx on veiculos (placa_normalizada(placa));
-- Um veículo por técnico.
create unique index veiculos_tecnico_idx on veiculos (tecnico_id) where tecnico_id is not null and ativo;

create table veiculo_manutencoes (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references veiculos (id) on delete cascade,
  tipo text not null check (tipo in ('troca_oleo', 'pneu', 'revisao', 'freios', 'bateria', 'funilaria', 'lavagem', 'outro')),
  data date not null default current_date,
  odometro_km integer check (odometro_km is null or odometro_km >= 0),
  valor numeric(10, 2) check (valor is null or valor >= 0),
  oficina text,
  descricao text,
  criado_por uuid references usuarios (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now()
);
create index veiculo_manutencoes_idx on veiculo_manutencoes (veiculo_id, data desc);

-- Gastos da frota (combustível, pedágio, estacionamento, manutenção) ficam em despesas, ligados pela placa.
-- Manutenção paga pelo técnico diz o que foi feito; troca de óleo conta para o próximo aviso.
alter table despesas add column if not exists tipo_manutencao text
  check (tipo_manutencao is null or tipo_manutencao in ('troca_oleo', 'pneu', 'revisao', 'freios', 'bateria', 'funilaria', 'lavagem', 'outro'));

-- Veículo usado na O.S.: gravado quando o técnico inicia (vai para o relatório).
alter table ordens_servico add column if not exists veiculo_id uuid references veiculos (id) on delete set null;

create or replace function os_grava_veiculo() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.veiculo_id is null and new.tecnico_id is not null and new.status = 'em_execucao' then
    select id into new.veiculo_id from veiculos where tecnico_id = new.tecnico_id and ativo limit 1;
  end if;
  return new;
end $$;
create trigger ordens_servico_veiculo before insert or update of status on ordens_servico
  for each row execute function os_grava_veiculo();

alter table veiculo_manutencoes enable row level security;

-- veiculos: leitura para todos os logados e escrita do supervisor já vêm do MVP.
create policy manutencoes_supervisor on veiculo_manutencoes for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());
create policy manutencoes_tecnico_ler on veiculo_manutencoes for select to authenticated
  using (exists (select 1 from veiculos v where v.id = veiculo_id and v.tecnico_id = auth.uid()));

-- Situação de cada veículo: km atual, troca de óleo (próxima por km ou data) e último abastecimento.
create view veiculos_situacao with (security_invoker = true) as
with abastecimentos as (
  select placa_normalizada(placa) as placa, max(odometro_km) as km, max(data) as ultimo,
         count(*) as qtd, sum(valor) as gasto, sum(litros) as litros
  from despesas where categoria = 'combustivel' and status <> 'recusada'
  group by 1
),
oleo as (
  select veiculo_id, data, odometro_km from veiculo_manutencoes where tipo = 'troca_oleo'
  union all
  select v.id, d.data, d.odometro_km from despesas d join veiculos v on placa_normalizada(v.placa) = placa_normalizada(d.placa)
  where d.categoria = 'manutencao_veiculo' and d.tipo_manutencao = 'troca_oleo' and d.status <> 'recusada'
),
ultimo_oleo as (
  select distinct on (veiculo_id) veiculo_id, data, odometro_km from oleo order by veiculo_id, data desc, odometro_km desc nulls last
),
km_manut as (select veiculo_id, max(odometro_km) km from veiculo_manutencoes group by 1)
select
  v.*,
  u.nome as tecnico,
  greatest(v.odometro_km, a.km, km_manut.km) as km_atual,
  a.ultimo as ultimo_abastecimento,
  coalesce(a.qtd, 0) as abastecimentos,
  coalesce(a.gasto, 0) as gasto_combustivel,
  a.litros as litros_total,
  o.data as ultima_troca_oleo,
  o.odometro_km as km_ultima_troca_oleo,
  o.odometro_km + v.oleo_intervalo_km as proxima_troca_km,
  o.data + v.oleo_intervalo_dias as proxima_troca_data,
  case
    when o.data is null then 'sem_registro'
    when greatest(v.odometro_km, a.km, km_manut.km) >= o.odometro_km + v.oleo_intervalo_km
      or current_date >= o.data + v.oleo_intervalo_dias then 'vencida'
    when greatest(v.odometro_km, a.km, km_manut.km) >= o.odometro_km + v.oleo_intervalo_km - 1000
      or current_date >= o.data + v.oleo_intervalo_dias - 15 then 'proxima'
    else 'ok'
  end as situacao_oleo
from veiculos v
left join usuarios u on u.id = v.tecnico_id
left join abastecimentos a on a.placa = placa_normalizada(v.placa)
left join ultimo_oleo o on o.veiculo_id = v.id
left join km_manut on km_manut.veiculo_id = v.id;

-- O.S. de apresentação (abordagem policial): dados da empresa e documento do técnico.
alter table usuarios add column if not exists documento text; -- CPF ou RG, preenchido pelo supervisor

create table config_empresa (
  id boolean primary key default true check (id),
  razao_social text,
  cnpj text,
  endereco text,
  telefone text,       -- contato 24h para confirmar o serviço
  responsavel text,    -- nome do supervisor/responsável
  contratante text,    -- operadora/cliente para quem o serviço é prestado
  atualizado_em timestamptz not null default now()
);
insert into config_empresa (id, razao_social) values (true, 'Multivale Engenharia') on conflict (id) do nothing;
alter table config_empresa enable row level security;
create policy config_empresa_ler on config_empresa for select to authenticated using (true);
create policy config_empresa_supervisor on config_empresa for update to authenticated
  using (eh_supervisor()) with check (eh_supervisor());
