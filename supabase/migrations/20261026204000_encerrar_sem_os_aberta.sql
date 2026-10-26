-- Thiago: só encerra o expediente com a fila vazia. Qualquer O.S. aberta do técnico (nova, visualizada, em execução,
-- pausada ou devolvida) bloqueia; a pausada "para continuar amanhã" (roteamento de vários dias) continua liberada.
create or replace function expediente_bloqueia_encerrar() returns trigger
language plpgsql set search_path = public
as $$
declare
  aberta integer;
begin
  if new.fim is not null and old.fim is null then
    select numero into aberta from ordens_servico
     where tecnico_id = new.tecnico_id and status in ('enviada', 'aceita', 'em_execucao', 'pausada', 'devolvida')
       and not (status = 'pausada' and continua_em is not null)
     order by numero limit 1;
    if aberta is not null then
      raise exception 'Conclua a O.S. #% antes de encerrar o expediente', aberta
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
