-- Classe da equipe (L ou F), cadastrada no técnico responsável; vale para os auxiliares dele.
alter table usuarios add column if not exists classe_equipe text check (classe_equipe in ('L', 'F'));

-- Equipe de quem está logado (técnico ou auxiliar): classe, técnico e auxiliares, para a máscara da foto.
create or replace function minha_equipe()
returns json
language sql stable security definer set search_path = public
as $$
  with eu as (select coalesce(case when papel = 'auxiliar' then tecnico_responsavel_id end, id) as tec from usuarios where id = auth.uid())
  select json_build_object(
    'classe', t.classe_equipe,
    'tecnico', json_build_object('nome', t.nome, 'cargo', t.cargo),
    'auxiliares', coalesce((select json_agg(json_build_object('nome', a.nome, 'cargo', a.cargo) order by a.nome)
      from usuarios a where a.tecnico_responsavel_id = t.id and a.papel = 'auxiliar' and a.ativo), '[]'::json))
  from eu join usuarios t on t.id = eu.tec
$$;
revoke execute on function minha_equipe() from anon, public;
grant execute on function minha_equipe() to authenticated;
