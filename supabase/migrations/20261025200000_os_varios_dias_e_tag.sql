-- 1) Atividade de vários dias (roteamento): o técnico pausa "para continuar amanhã" e pode encerrar o expediente.
alter table ordens_servico add column continua_em date;

create or replace function os_limpa_continua() returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.status is distinct from 'pausada' then new.continua_em := null; end if;
  return new;
end $$;
create trigger os_limpa_continua before update on ordens_servico
  for each row execute function os_limpa_continua();

create or replace function expediente_bloqueia_encerrar() returns trigger
language plpgsql set search_path = public
as $$
declare
  aberta integer;
begin
  if new.fim is not null and old.fim is null then
    select numero into aberta from ordens_servico
     where tecnico_id = new.tecnico_id and status in ('em_execucao', 'pausada')
       and not (status = 'pausada' and continua_em is not null)
     limit 1;
    if aberta is not null then
      raise exception 'Conclua a O.S. #% antes de encerrar o expediente', aberta
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- 2) TAG automática das caixas: CE-BKB-0001 (emenda), ENT-BKB-0001 (entroncamento), DGO-BKB-0001.
-- O app já sugere a próxima TAG (funciona offline); no servidor, se vier vazia ou já usada por outra caixa, vira a próxima livre.
create or replace function prefixo_tag_caixa(p_tipo text) returns text
language sql immutable set search_path = public as $$
  select case p_tipo when 'entroncamento' then 'ENT-BKB-' when 'dgo' then 'DGO-BKB-' else 'CE-BKB-' end
$$;

create or replace function caixa_tag_automatica() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  prefixo text := prefixo_tag_caixa(new.tipo);
  proximo int;
begin
  if coalesce(trim(new.identificacao), '') = ''
     or exists (select 1 from caixas_emenda c where upper(c.identificacao) = upper(new.identificacao) and c.id <> new.id) then
    perform pg_advisory_xact_lock(hashtext('tag_caixa'));
    select coalesce(max(substring(identificacao from length(prefixo) + 1)::int), 0) + 1 into proximo
      from caixas_emenda where identificacao ~ ('^' || prefixo || '[0-9]+$');
    new.identificacao := prefixo || lpad(proximo::text, 4, '0');
  end if;
  return new;
end $$;
create trigger caixas_tag_automatica before insert on caixas_emenda
  for each row execute function caixa_tag_automatica();
