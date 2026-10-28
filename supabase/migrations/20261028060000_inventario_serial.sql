-- Inventário: foto da plaqueta/número de série e o número digitado pelo técnico.
-- O número digitado atualiza o cadastro do item, que segue com o técnico nos meses seguintes até mudar.
alter table inventario_inspecoes add column if not exists foto_serial text; -- caminho no bucket "inventario"
alter table inventario_inspecoes add column if not exists numero_serie text;

create or replace function inventario_atualiza_serie()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if nullif(trim(new.numero_serie), '') is not null then
    update ferramentas set numero_serie = upper(trim(new.numero_serie))
     where id = new.ferramenta_id and coalesce(numero_serie, '') <> upper(trim(new.numero_serie));
  end if;
  return new;
end;
$$;

create or replace trigger inventario_atualiza_serie after insert on inventario_inspecoes
  for each row execute function inventario_atualiza_serie();
