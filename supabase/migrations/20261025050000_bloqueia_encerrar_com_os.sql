-- Não deixa encerrar o expediente com O.S. em execução ou pausada.
create function expediente_bloqueia_encerrar() returns trigger
language plpgsql set search_path = public
as $$
declare
  aberta integer;
begin
  if new.fim is not null and old.fim is null then
    select numero into aberta from ordens_servico
     where tecnico_id = new.tecnico_id and status in ('em_execucao', 'pausada')
     limit 1;
    if aberta is not null then
      raise exception 'Conclua a O.S. #% antes de encerrar o expediente', aberta
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger expediente_bloqueia_encerrar before update on expedientes
  for each row execute function expediente_bloqueia_encerrar();
