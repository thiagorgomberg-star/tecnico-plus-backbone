-- Apuração de horas pela CLT, dia a dia, a partir dos expedientes, refeições e escala.
--   Dia útil: o que passar da jornada do dia é hora extra 50%; o que faltar é falta (só em dias já passados).
--   Sábado: todo o trabalho é 50%. Domingo e feriado nacional: 100%.
--   Folga programada, férias e atestado: jornada esperada zero (trabalho nesses dias vira extra 50%, ou 100% se domingo/feriado).
--   Plantão (sobreaviso): as horas de plantão sem trabalho valem 1/3 da hora; as trabalhadas entram como extra.
--   Tolerância do art. 58 §1º: diferença de até 10 min no dia não conta.
--   Jornada do dia = escala "jornada" com horário, senão o cadastro do técnico (sexta tem fim próprio), menos 1 h de intervalo.
--   Banco de horas (técnicos com esse regime): crédito 1 para 1 das extras, débito das faltas.

create or replace function feriado_nacional(d date) returns boolean
language plpgsql immutable set search_path = public
as $$
declare
  ano int := extract(year from d);
  a int := ano % 19; b int := ano / 100; c int := ano % 100;
  dd int := b / 4; e int := b % 4; f int := (b + 8) / 25; g int := (b - f + 1) / 3;
  h int := (19 * a + b - dd - g + 15) % 30; i int := c / 4; k int := c % 4;
  l int := (32 + 2 * e + 2 * i - h - k) % 7; m int := (a + 11 * h + 22 * l) / 451;
  pascoa date := make_date(ano, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
begin
  return to_char(d, 'MM-DD') in ('01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25')
    or d in (pascoa - 48, pascoa - 47, pascoa - 2, pascoa + 60); -- carnaval, sexta santa, corpus christi
end $$;

create or replace function apuracao_horas(p_de date, p_ate date)
returns table (
  tecnico_id uuid, tecnico text, regime text, data date, tipo_dia text,
  esperado_min int, trabalhado_min int, extra50_min int, extra100_min int, falta_min int, sobreaviso_min int, banco_min int
)
language sql stable set search_path = public
as $$
  with dias as (
    select u.id as tecnico_id, u.nome as tecnico, u.regime_horas as regime, d::date as data,
      u.inicio_jornada, case when extract(isodow from d) = 5 then u.fim_jornada_sexta else u.fim_jornada end as fim_padrao,
      (d::date::timestamp at time zone 'America/Sao_Paulo') as dia_ini,
      ((d::date + 1)::timestamp at time zone 'America/Sao_Paulo') as dia_fim
    from usuarios u
    cross join generate_series(p_de, p_ate, interval '1 day') d
    where u.papel = 'tecnico' and u.ativo
  ),
  esc as (
    select e.tecnico_id, e.data,
      bool_or(e.tipo in ('folga_programada', 'ferias', 'atestado')) as ausencia,
      min(e.tipo::text) filter (where e.tipo in ('folga_programada', 'ferias', 'atestado')) as ausencia_tipo,
      min(e.inicio) filter (where e.tipo = 'jornada') as j_ini, max(e.fim) filter (where e.tipo = 'jornada') as j_fim,
      bool_or(e.tipo in ('plantao', 'sobreaviso')) as plantao,
      min(e.inicio) filter (where e.tipo in ('plantao', 'sobreaviso')) as p_ini,
      max(e.fim) filter (where e.tipo in ('plantao', 'sobreaviso')) as p_fim
    from escala e where e.data between p_de and p_ate
    group by e.tecnico_id, e.data
  ),
  base as (
    select d.*, es.ausencia, es.ausencia_tipo, es.plantao, es.p_ini, es.p_fim,
      coalesce(es.j_ini, d.inicio_jornada) as j_ini, coalesce(es.j_fim, d.fim_padrao) as j_fim,
      case when feriado_nacional(d.data) then 'feriado'
           when extract(isodow from d.data) = 7 then 'domingo'
           when extract(isodow from d.data) = 6 then 'sabado' else 'util' end as calendario,
      -- minutos trabalhados no dia (expediente aberto conta até agora), menos refeições
      coalesce((select sum(extract(epoch from least(coalesce(x.fim, now()), d.dia_fim) - greatest(x.inicio, d.dia_ini)) / 60)
                  from expedientes x
                 where x.tecnico_id = d.tecnico_id and x.inicio < d.dia_fim and coalesce(x.fim, now()) > d.dia_ini), 0)
      - coalesce((select sum(extract(epoch from least(coalesce(r.fim, now()), d.dia_fim) - greatest(r.inicio, d.dia_ini)) / 60)
                    from refeicoes r
                   where r.tecnico_id = d.tecnico_id and r.inicio < d.dia_fim and coalesce(r.fim, now()) > d.dia_ini), 0) as trab
    from dias d
    left join esc es on es.tecnico_id = d.tecnico_id and es.data = d.data
  ),
  calc as (
    select b.*,
      case when b.calendario <> 'util' or coalesce(b.ausencia, false) then 0
           else greatest(0, extract(epoch from b.j_fim - b.j_ini) / 60
                - case when extract(epoch from b.j_fim - b.j_ini) / 60 > 360 then 60 else 0 end) end as esperado,
      case when not coalesce(b.plantao, false) then 0
           when b.p_ini is null or b.p_fim is null then 1440
           when b.p_fim > b.p_ini then extract(epoch from b.p_fim - b.p_ini) / 60
           else 1440 - extract(epoch from b.p_ini - b.p_fim) / 60 end as plantao_min
    from base b
  ),
  final as (
    select c.*, round(greatest(c.trab, 0))::int as t, round(c.esperado)::int as esp,
      case when c.calendario in ('domingo', 'feriado') then 100 else 50 end as adicional
    from calc c
  ),
  apurado as (
    select f.*,
      case when abs(f.t - f.esp) <= 10 then 0 else greatest(0, f.t - f.esp) end as extra,
      case when abs(f.t - f.esp) <= 10 or f.data >= (now() at time zone 'America/Sao_Paulo')::date then 0
           else greatest(0, f.esp - f.t) end as falta
    from final f
  )
  select a.tecnico_id, a.tecnico, a.regime, a.data,
    coalesce(a.ausencia_tipo, a.calendario) as tipo_dia,
    a.esp, a.t,
    case when a.adicional = 50 then a.extra else 0 end,
    case when a.adicional = 100 then a.extra else 0 end,
    a.falta,
    greatest(0, round(a.plantao_min)::int - a.t),
    case when a.regime = 'banco_horas' then a.extra - a.falta else 0 end
  from apurado a
  order by a.tecnico, a.data
$$;
