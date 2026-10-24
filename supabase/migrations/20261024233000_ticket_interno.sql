-- Atividade sem ticket de acionamento: o sistema gera um token hexadecimal único só para controle
-- (16 dígitos hexadecimais, ex.: 7F3A9C2E41B08D6F). ticket_interno marca que o código foi gerado pelo sistema.
alter table ordens_servico add column ticket_interno boolean not null default false;

create function gerar_token_ticket() returns text
language plpgsql volatile set search_path = public
as $$
declare
  token text;
begin
  loop
    token := upper(substr(md5(gen_random_uuid()::text), 1, 16));
    exit when not exists (select 1 from ordens_servico where ticket_acionamento = token);
  end loop;
  return token;
end;
$$;

create function os_gera_ticket() returns trigger
language plpgsql set search_path = public
as $$
begin
  if nullif(btrim(new.ticket_acionamento), '') is not null then
    new.ticket_acionamento := btrim(new.ticket_acionamento);
    new.ticket_interno := false;
  else
    new.ticket_acionamento := gerar_token_ticket();
    new.ticket_interno := true;
  end if;
  return new;
end;
$$;

create trigger os_gera_ticket before insert on ordens_servico
  for each row execute function os_gera_ticket();

-- O.S. já criadas sem ticket recebem um token.
update ordens_servico set ticket_acionamento = gerar_token_ticket(), ticket_interno = true
 where nullif(btrim(ticket_acionamento), '') is null;
