-- Thiago 2026-10-26: concluir a O.S. não exige mais um mínimo de fotos.
create or replace function minimo_fotos_os() returns integer
language sql immutable set search_path = public
as $$ select 0 $$;
