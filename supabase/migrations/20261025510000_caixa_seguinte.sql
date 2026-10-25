-- Técnico em campo liga uma saída da caixa dele à caixa seguinte já cadastrada (de qualquer O.S.):
-- a seguinte passa a vir desta caixa/saída. p_seguinte null desfaz a ligação daquela saída.
create or replace function ligar_caixa_seguinte(p_caixa uuid, p_saida int, p_seguinte uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_os uuid;
begin
  select os_id into v_os from caixas_emenda where id = p_caixa;
  if v_os is null then raise exception 'Caixa não encontrada'; end if;
  if not (eh_supervisor() or os_em_campo_comigo(v_os)) then
    raise exception 'Sem permissão para ligar caixas desta O.S.';
  end if;
  -- Desliga quem estava nesta saída e não é mais a seguinte.
  update caixas_emenda set origem_caixa_id = null, origem_saida = null, atualizado_em = now()
   where origem_caixa_id = p_caixa and origem_saida = p_saida and id is distinct from p_seguinte;
  if p_seguinte is not null then
    if p_seguinte = p_caixa then raise exception 'A caixa não pode seguir ela mesma'; end if;
    update caixas_emenda set origem_caixa_id = p_caixa, origem_saida = p_saida, origem_dgo = null, atualizado_em = now()
     where id = p_seguinte;
  end if;
end $$;
revoke execute on function ligar_caixa_seguinte(uuid, int, uuid) from public, anon;
grant execute on function ligar_caixa_seguinte(uuid, int, uuid) to authenticated;
