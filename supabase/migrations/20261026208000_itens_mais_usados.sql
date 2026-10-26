-- Serviços e materiais mais lançados em cada tipo de O.S. (todos os técnicos, últimos 180 dias): o app mostra esses primeiro.
create or replace function itens_mais_usados(p_tipo text)
returns table (item_id uuid, vezes int)
language sql stable security definer set search_path = public
as $$
  select e.item_id, count(*)::int as vezes
    from os_servicos_executados e
    join ordens_servico o on o.id = e.os_id
   where o.tipo = p_tipo and e.lancado_em > now() - interval '180 days' and auth.uid() is not null
   group by e.item_id
   order by vezes desc
   limit 30
$$;
revoke execute on function itens_mais_usados(text) from public, anon;
grant execute on function itens_mais_usados(text) to authenticated;
