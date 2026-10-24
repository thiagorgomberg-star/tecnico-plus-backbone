-- Abrir um expediente novo fecha o que ficou aberto do mesmo técnico (ex.: app reinstalado ou
-- celular trocado no meio do dia). Antes o insert batia no índice "um aberto" e o trajeto do dia
-- ficava apontando para um expediente que não existia no servidor.
create or replace function public.fechar_expediente_aberto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update expedientes
     set fim = greatest(inicio, new.inicio)
   where tecnico_id = new.tecnico_id
     and fim is null
     and id <> new.id;
  return new;
end;
$$;

create trigger expedientes_fecha_aberto
  before insert on expedientes
  for each row execute function public.fechar_expediente_aberto();
