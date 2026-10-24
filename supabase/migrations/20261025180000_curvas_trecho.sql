-- Curvas OTDR por trecho, junto do KMZ: arquivos enviados pelo painel (.sor, PDF, imagem...) e as fotos de OTDR
-- tiradas em campo nas O.S. do trecho. Alerta quando o trecho passa de 30 dias sem curva nova.

create table rota_curvas (
  id uuid primary key default gen_random_uuid(),
  rota_id uuid not null references rotas (id) on delete cascade,
  tirada_em date not null default current_date,
  caminho_arquivo text not null, -- caminho no bucket "curvas": <rota_id>/<arquivo>
  nome_arquivo text not null,
  fibra int,
  ponta text,
  observacao text,
  enviado_por uuid not null references usuarios (id) default auth.uid(),
  criado_em timestamptz not null default now()
);
create index rota_curvas_rota_idx on rota_curvas (rota_id, tirada_em desc);

alter table rota_curvas enable row level security;
create policy rota_curvas_ler on rota_curvas for select to authenticated using (true);
create policy rota_curvas_inserir on rota_curvas for insert to authenticated with check (enviado_por = auth.uid());
create policy rota_curvas_supervisor on rota_curvas for all to authenticated using (eh_supervisor()) with check (eh_supervisor());

insert into storage.buckets (id, name, public, file_size_limit)
values ('curvas', 'curvas', false, 30 * 1024 * 1024)
on conflict (id) do nothing;

create policy curvas_storage_ler on storage.objects for select to authenticated using (bucket_id = 'curvas');
create policy curvas_storage_enviar on storage.objects for insert to authenticated with check (bucket_id = 'curvas');
create policy curvas_storage_apagar on storage.objects for delete to authenticated using (bucket_id = 'curvas' and public.eh_supervisor());

-- Foto de OTDR tirada em campo: qualquer técnico pode abrir (para comparar com a curva anterior do trecho).
create function eh_foto_otdr(caminho text) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from os_anexos where caminho_arquivo = caminho and tipo = 'foto_otdr');
$$;
revoke execute on function eh_foto_otdr(text) from public, anon;
grant execute on function eh_foto_otdr(text) to authenticated;

create policy os_anexos_storage_otdr_ler on storage.objects for select to authenticated
  using (bucket_id = 'os-anexos' and public.eh_foto_otdr(name));

-- Todas as curvas de cada trecho (as mais recentes primeiro), com total e data da última por trecho.
create function curvas_trecho(p_limite int default 10)
returns table (
  rota_id uuid, origem text, tirada_em timestamptz, bucket text, caminho text, nome text,
  fibra int, ponta text, observacao text, os_numero int, enviado_por text, total int, ultima_em timestamptz
)
language sql stable security definer set search_path = public
as $$
  with todas as (
    select c.rota_id, 'arquivo'::text as origem, c.tirada_em::timestamp at time zone 'America/Sao_Paulo' as tirada_em,
      'curvas'::text as bucket, c.caminho_arquivo as caminho, c.nome_arquivo as nome,
      c.fibra, c.ponta, c.observacao, null::int as os_numero, u.nome as enviado_por
    from rota_curvas c join usuarios u on u.id = c.enviado_por
    union all
    select o.rota_id, 'campo', coalesce(a.tirada_em, a.criado_em), 'os-anexos', a.caminho_arquivo,
      coalesce(a.nome_arquivo, 'foto OTDR'), a.fibra, ce.identificacao, a.descricao, o.numero, u.nome
    from os_anexos a
    join ordens_servico o on o.id = a.os_id
    left join caixas_emenda ce on ce.id = a.caixa_id
    left join usuarios u on u.id = a.enviado_por
    where a.tipo = 'foto_otdr' and o.rota_id is not null
  ),
  numeradas as (
    select t.*, row_number() over (partition by t.rota_id order by t.tirada_em desc) as n,
      count(*) over (partition by t.rota_id)::int as total,
      max(t.tirada_em) over (partition by t.rota_id) as ultima_em
    from todas t
  )
  select rota_id, origem, tirada_em, bucket, caminho, nome, fibra, ponta, observacao, os_numero, enviado_por, total, ultima_em
  from numeradas
  where n <= p_limite and auth.uid() is not null
  order by rota_id, tirada_em desc
$$;
revoke execute on function curvas_trecho(int) from public, anon;
grant execute on function curvas_trecho(int) to authenticated;
