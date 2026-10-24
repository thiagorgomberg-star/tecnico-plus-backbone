-- Se a caixa mudar de tipo (ex.: emenda → DGO) e ainda tiver uma TAG automática, ganha a próxima TAG do novo tipo.
create or replace function caixa_tag_automatica() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  prefixo text := prefixo_tag_caixa(new.tipo);
  proximo int;
begin
  if tg_op = 'UPDATE' and new.tipo is distinct from old.tipo
     and new.identificacao ~ '^(CE|ENT|DGO|SITE)-BKB-[0-9]+$' and new.identificacao !~ ('^' || prefixo) then
    new.identificacao := '';
  end if;
  if coalesce(trim(new.identificacao), '') = ''
     or exists (select 1 from caixas_emenda c where upper(c.identificacao) = upper(new.identificacao) and c.id <> new.id) then
    perform pg_advisory_xact_lock(hashtext('tag_caixa'));
    select coalesce(max(substring(identificacao from length(prefixo) + 1)::int), 0) + 1 into proximo
      from caixas_emenda where identificacao ~ ('^' || prefixo || '[0-9]+$');
    new.identificacao := prefixo || lpad(proximo::text, 4, '0');
  end if;
  return new;
end $$;
create trigger caixas_tag_troca_tipo before update of tipo on caixas_emenda
  for each row execute function caixa_tag_automatica();
