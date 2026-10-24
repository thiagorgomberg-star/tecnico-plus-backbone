-- Comandos rodados direto no banco (SQL Editor do Supabase, sem login de app) podem ajustar
-- perfis; usuários logados no app continuam sendo verificados.
create or replace function usuarios_protege_campos() returns trigger
language plpgsql set search_path = public
as $$
begin
  if auth.uid() is not null and not eh_supervisor() and (
       new.papel is distinct from old.papel
    or new.ativo is distinct from old.ativo
    or new.matricula is distinct from old.matricula
    or new.cargo is distinct from old.cargo
    or new.nome is distinct from old.nome
    or new.inicio_jornada is distinct from old.inicio_jornada
    or new.fim_jornada is distinct from old.fim_jornada) then
    raise exception 'Somente o supervisor pode alterar nome, cargo, papel, matrícula, jornada ou status';
  end if;
  return new;
end;
$$;

