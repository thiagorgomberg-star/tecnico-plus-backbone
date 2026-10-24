-- Solicitação de reembolso: o técnico marca que pagou do próprio bolso; o supervisor aprova e depois marca como pago.
alter table despesas
  add column reembolso text check (reembolso in ('solicitado', 'pago')),
  add column reembolso_pago_em timestamptz,
  add column reembolso_pago_por uuid references usuarios(id);

update despesas set reembolso = 'solicitado' where pagamento = 'reembolso' and reembolso is null;

-- Técnico não marca reembolso como pago nem mexe na data do pagamento.
create or replace function despesa_reabrir() returns trigger
language plpgsql set search_path = public
as $$
begin
  if not eh_supervisor() then
    new.conferida_em := null;
    new.motivo_recusa := null;
    if new.reembolso = 'pago' and old.reembolso is distinct from 'pago' then new.reembolso := 'solicitado'; end if;
    new.reembolso_pago_em := old.reembolso_pago_em;
    new.reembolso_pago_por := old.reembolso_pago_por;
  end if;
  return new;
end $$;

create or replace function despesa_reembolso_insert() returns trigger
language plpgsql set search_path = public
as $$
begin
  if not eh_supervisor() then
    if new.reembolso = 'pago' then new.reembolso := 'solicitado'; end if;
    new.reembolso_pago_em := null;
    new.reembolso_pago_por := null;
  end if;
  return new;
end $$;
create trigger despesas_reembolso_insert before insert on despesas
  for each row execute function despesa_reembolso_insert();

-- A view lista as colunas da tabela por nome para poder acrescentar as novas no fim.
create or replace view despesas_planilha with (security_invoker = true) as
select
  d.id, d.tecnico_id, d.data, d.categoria, d.valor, d.pagamento, d.fornecedor, d.descricao, d.os_id, d.placa, d.litros,
  d.odometro_km, d.combustivel, d.comprovante, d.posicao, d.status, d.conferida_por, d.conferida_em, d.motivo_recusa, d.criado_em,
  u.nome as tecnico,
  o.numero as os_numero,
  c.nome as conferida_por_nome,
  extensions.st_y(d.posicao::extensions.geometry) as latitude,
  extensions.st_x(d.posicao::extensions.geometry) as longitude,
  case when d.categoria = 'combustivel' then
    d.odometro_km - lag(d.odometro_km) over w end as km_rodados,
  case when d.categoria = 'combustivel' and d.litros > 0 then
    round(((d.odometro_km - lag(d.odometro_km) over w) / d.litros)::numeric, 2) end as km_por_litro,
  case when d.categoria = 'combustivel' and d.litros > 0 then round(d.valor / d.litros, 3) end as preco_litro,
  d.reembolso, d.reembolso_pago_em, d.reembolso_pago_por
from despesas d
join usuarios u on u.id = d.tecnico_id
left join ordens_servico o on o.id = d.os_id
left join usuarios c on c.id = d.conferida_por
window w as (partition by d.categoria, upper(replace(d.placa, '-', '')) order by d.odometro_km, d.data, d.criado_em);
