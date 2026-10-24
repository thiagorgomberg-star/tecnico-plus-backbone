-- Técnico pede a devolução de uma ferramenta/EPI pelo app; o supervisor confirma no painel.
alter table ferramentas
  add column if not exists devolucao_solicitada_em timestamptz,
  add column if not exists devolucao_observacao text;

create or replace function solicitar_devolucao_ferramenta(p_id uuid, p_observacao text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update ferramentas
     set devolucao_solicitada_em = now(), devolucao_observacao = nullif(trim(p_observacao), '')
   where id = p_id and tecnico_id = auth.uid() and situacao = 'ativa';
  if not found then
    raise exception 'Item não encontrado entre as suas ferramentas ativas.';
  end if;
  insert into alertas (usuario_id, tipo, mensagem)
  select u.id, 'devolucao_ferramenta', (select nome from usuarios where id = auth.uid()) || ' pediu a devolução de: ' || f.nome
    from usuarios u, ferramentas f
   where f.id = p_id and u.papel in ('supervisor', 'admin') and u.ativo;
end $$;
revoke execute on function solicitar_devolucao_ferramenta(uuid, text) from anon, public;
grant execute on function solicitar_devolucao_ferramenta(uuid, text) to authenticated;

create or replace view inventario_situacao with (security_invoker = true) as
select f.id, f.tecnico_id, f.categoria, f.nome, f.marca_modelo, f.numero_serie, f.patrimonio, f.validade, f.liberada_em,
  f.situacao, f.observacao, f.criado_por, f.criado_em,
  u.nome as tecnico,
  i.feita_em as ultima_inspecao, i.condicao as ultima_condicao, i.foto as ultima_foto, i.observacao as ultima_observacao,
  coalesce(i.feita_em, f.criado_em) + interval '30 days' as proxima_ate,
  case
    when i.feita_em is null then 'pendente'
    when i.feita_em + interval '30 days' < now() then 'vencida'
    when i.feita_em + interval '25 days' < now() then 'vence_em_breve'
    else 'em_dia'
  end as ciclo,
  f.devolucao_solicitada_em, f.devolucao_observacao
from ferramentas f
join usuarios u on u.id = f.tecnico_id
left join lateral (
  select x.feita_em, x.condicao, x.foto, x.observacao from inventario_inspecoes x
  where x.ferramenta_id = f.id order by x.feita_em desc limit 1
) i on true
where f.situacao = 'ativa';

-- Supervisor exclui itens do Ferramental junto com as fotos.
create policy inventario_storage_supervisor_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'inventario' and public.eh_supervisor());

-- Supervisor exclui despesas junto com o comprovante.
create policy despesas_storage_supervisor_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'despesas' and public.eh_supervisor());

-- Supervisor exclui fotos/anexos (ex.: ao excluir uma caixa).
create policy os_anexos_supervisor_exclui on os_anexos for delete to authenticated using (eh_supervisor());
