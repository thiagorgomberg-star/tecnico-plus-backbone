-- Regime de horas por técnico: hora extra paga ou banco de horas.
-- Jornada (inicio_jornada/fim_jornada, padrão 08:00–17:00) e regime são definidos pelo supervisor.
alter table usuarios add column regime_horas text not null default 'hora_extra'
  check (regime_horas in ('hora_extra', 'banco_horas'));

create function usuarios_protege_regime() returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.regime_horas is distinct from old.regime_horas and not eh_supervisor() then
    raise exception 'Somente o supervisor pode alterar o regime de horas';
  end if;
  return new;
end;
$$;

create trigger usuarios_protege_regime before update on usuarios
  for each row execute function usuarios_protege_regime();
