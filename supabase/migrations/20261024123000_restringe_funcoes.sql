-- Funções security definer não ficam expostas na API para quem não está logado.
-- eh_supervisor() continua liberada para usuários logados porque as regras de acesso (RLS) dependem dela.
revoke execute on function eh_supervisor() from public, anon;
grant execute on function eh_supervisor() to authenticated;

-- Função de gatilho: só roda pelo trigger, nunca chamada direto.
revoke execute on function os_registra_evento() from public, anon, authenticated;
