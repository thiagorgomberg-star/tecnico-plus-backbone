-- Conta de serviço do Firebase guardada no Vault (segredo 'fcm_conta_servico', criado direto no projeto,
-- nunca no repositório); só a função enviar-push (service_role) lê.
create or replace function interno_segredo_fcm() returns text
language plpgsql stable security definer set search_path = public, vault
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'sem permissão';
  end if;
  return (select decrypted_secret from vault.decrypted_secrets where name = 'fcm_conta_servico' limit 1);
end $$;
