
-- O técnico vê quem é o auxiliar dele (nome e documento para a O.S. de apresentação), sem acesso ao resto da ficha.
create or replace function meus_auxiliares()
returns table (id uuid, nome text, cargo text, cpf text, rg text)
language sql stable security definer set search_path = public
as $$
  select a.id, a.nome, a.cargo, a.cpf, a.rg from usuarios a
   where a.tecnico_responsavel_id = auth.uid() and a.papel = 'auxiliar' and a.ativo
   order by a.nome
$$;
revoke execute on function meus_auxiliares() from anon, public;
grant execute on function meus_auxiliares() to authenticated;
