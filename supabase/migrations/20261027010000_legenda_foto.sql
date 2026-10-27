-- Legenda da foto (os_anexos.descricao) escrita pelo técnico no balão "+" da foto, ou pelo supervisor.
create or replace function public.legendar_foto_os(p_caminho text, p_legenda text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare n int;
begin
  update os_anexos a
     set descricao = nullif(btrim(left(p_legenda, 300)), '')
   where a.caminho_arquivo = p_caminho
     and a.tipo in ('foto_antes', 'foto_depois')
     and (a.enviado_por = auth.uid() or eh_supervisor()
          or exists (select 1 from ordens_servico o where o.id = a.os_id and o.tecnico_id = auth.uid())
          or exists (select 1 from os_tecnicos_apoio t where t.os_id = a.os_id and t.tecnico_id = auth.uid()));
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Foto não encontrada ou sem permissão para legendar'; end if;
  return true;
end $function$;

revoke execute on function public.legendar_foto_os(text, text) from public, anon;
grant execute on function public.legendar_foto_os(text, text) to authenticated;
