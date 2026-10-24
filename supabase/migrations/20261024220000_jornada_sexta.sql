-- Jornada padrão: segunda a quinta 08:00–18:00 e sexta 08:00–17:00.
-- fim_jornada vale de segunda a quinta; fim_jornada_sexta só para sexta.
alter table usuarios alter column fim_jornada set default '18:00';
alter table usuarios add column fim_jornada_sexta time not null default '17:00';
update usuarios set fim_jornada = '18:00' where fim_jornada = '17:00';

-- Plantão e sobreaviso são a mesma coisa: tudo vira plantão.
update escala e set tipo = 'plantao'
 where tipo = 'sobreaviso'
   and not exists (select 1 from escala x where x.tecnico_id = e.tecnico_id and x.data = e.data and x.tipo = 'plantao');

create or replace function usuarios_protege_regime() returns trigger
language plpgsql set search_path = public
as $$
begin
  if (new.regime_horas is distinct from old.regime_horas
      or new.fim_jornada_sexta is distinct from old.fim_jornada_sexta)
     and not eh_supervisor() then
    raise exception 'Somente o supervisor pode alterar o regime de horas ou a jornada';
  end if;
  return new;
end;
$$;
