-- Técnico (as próprias) e supervisor (qualquer) podem excluir fotos de caixa tiradas errado.
create or replace function excluir_foto_caixa(p_caminho text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with apagadas as (
    delete from os_anexos a
     where a.caminho_arquivo = p_caminho
       and a.caixa_id is not null
       and a.tipo in ('foto_caixa', 'foto_bandeja', 'foto_olt', 'foto_otdr')
       and (a.enviado_por = auth.uid() or eh_supervisor())
    returning 1)
  select count(*) into n from apagadas;
  if n = 0 then raise exception 'Foto não encontrada ou sem permissão para excluir'; end if;
  return true;
end $$;
revoke execute on function excluir_foto_caixa(text) from public, anon;
grant execute on function excluir_foto_caixa(text) to authenticated;
