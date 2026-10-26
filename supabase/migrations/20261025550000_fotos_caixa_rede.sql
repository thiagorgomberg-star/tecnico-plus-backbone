-- Fotos de caixa (acomodação, bandejas, OLT) ficam visíveis para toda a equipe: ajudam a achar e conferir a caixa em campo.
create or replace function eh_foto_de_caixa(caminho text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from os_anexos where caminho_arquivo = caminho and caixa_id is not null
                   and tipo in ('foto_caixa', 'foto_bandeja', 'foto_olt', 'foto_otdr'));
$$;
revoke execute on function eh_foto_de_caixa(text) from public, anon;
grant execute on function eh_foto_de_caixa(text) to authenticated;

create policy os_anexos_storage_caixa_ler on storage.objects for select to authenticated
  using (bucket_id = 'os-anexos' and public.eh_foto_de_caixa(name));

create or replace function fotos_da_caixa(p_caixa uuid)
returns table (caminho text, tipo text, bandeja int, fibra int, tirada_em timestamptz)
language sql stable security definer set search_path = public as $$
  select a.caminho_arquivo, a.tipo::text, a.bandeja, a.fibra, coalesce(a.tirada_em, a.criado_em)
    from os_anexos a
   where a.caixa_id = p_caixa and a.tipo in ('foto_caixa', 'foto_bandeja', 'foto_olt', 'foto_otdr')
   order by case a.tipo when 'foto_caixa' then 0 when 'foto_bandeja' then 1 else 2 end, a.bandeja nulls first, coalesce(a.tirada_em, a.criado_em);
$$;
revoke execute on function fotos_da_caixa(uuid) from public, anon;
grant execute on function fotos_da_caixa(uuid) to authenticated;
