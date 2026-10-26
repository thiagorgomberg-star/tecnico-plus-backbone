-- Botão "Atualizar" do mapa ao vivo: o supervisor pede a posição dos carros à GEOCAR na hora,
-- sem esperar o ciclo de 2 min. Cada chamada grava a resposta anterior e faz um pedido novo.
create or replace function geocar_atualizar_agora() returns timestamptz
language plpgsql security definer set search_path = public
as $$
begin
  if not eh_supervisor() then raise exception 'sem permissão'; end if;
  perform interno.geocar_sincronizar();
  return (select max(atualizado_em) from geocar_viaturas);
end $$;

revoke execute on function geocar_atualizar_agora() from public, anon;
grant execute on function geocar_atualizar_agora() to authenticated;
