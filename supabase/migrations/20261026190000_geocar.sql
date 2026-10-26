-- Rastreio dos veículos pela GEOCAR (API Gisgeo). A chave e o acesso ficam no Vault ('geocar_acesso',
-- criado direto no projeto, nunca no repositório). A cada 2 min o banco grava a resposta anterior e pede a próxima.

create table geocar_viaturas (
  viat_id integer primary key,
  matricula text not null,
  datahora timestamptz,
  latitude double precision,
  longitude double precision,
  velocidade_kmh integer,
  ignicao boolean,
  rua text,
  odometro integer,
  veiculo_id uuid references veiculos(id) on delete set null, -- mesma placa cadastrada na Frota
  seguir boolean not null default false, -- supervisor marcou para guardar o trajeto
  atualizado_em timestamptz not null default now()
);

create table geocar_posicoes (
  viat_id integer not null references geocar_viaturas(viat_id) on delete cascade,
  registrado_em timestamptz not null,
  latitude double precision not null,
  longitude double precision not null,
  velocidade_kmh integer,
  ignicao boolean,
  rua text,
  primary key (viat_id, registrado_em)
);

alter table geocar_viaturas enable row level security;
alter table geocar_posicoes enable row level security;

create policy geocar_viaturas_ler on geocar_viaturas for select to authenticated using (eh_supervisor());
create policy geocar_viaturas_seguir on geocar_viaturas for update to authenticated using (eh_supervisor()) with check (eh_supervisor());
create policy geocar_posicoes_ler on geocar_posicoes for select to authenticated using (eh_supervisor());
grant select, update (seguir) on geocar_viaturas to authenticated;
grant select on geocar_posicoes to authenticated;

create table interno.geocar_pedido (id integer primary key default 1, req_id bigint, enviado_em timestamptz);

create or replace function interno.placa_normal(p text) returns text
language sql immutable as $$ select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) $$;

create or replace function interno.geocar_sincronizar() returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_req bigint;
  v_resp jsonb;
  v_acesso jsonb;
begin
  -- 1) grava a resposta do pedido anterior
  select req_id into v_req from interno.geocar_pedido where id = 1;
  if v_req is not null then
    begin
      select content::jsonb into v_resp from net._http_response where id = v_req and status_code = 200;
    exception when others then
      v_resp := null;
    end;
    if v_resp->>'status' = '1' and jsonb_typeof(v_resp->'result') = 'array' then
      insert into geocar_viaturas as g (viat_id, matricula, datahora, latitude, longitude, velocidade_kmh, ignicao, rua, odometro, veiculo_id, atualizado_em)
      select (e->>'viat_id')::int,
             e->>'viat_matricula',
             to_timestamp(e->>'datahora', 'DD-MM-YYYY HH24:MI:SS')::timestamp at time zone 'UTC',
             nullif(e->>'viat_lat', '')::float8,
             nullif(e->>'viat_lon', '')::float8,
             nullif(e->>'viat_velocidade', '')::int,
             (e->>'viat_ignicao') = '1',
             e->>'viat_rua',
             nullif(e->>'viat_kms', '')::numeric::int,
             (select v.id from veiculos v where interno.placa_normal(v.placa) = interno.placa_normal(e->>'viat_matricula') limit 1),
             now()
        from jsonb_array_elements(v_resp->'result') e
       where e->>'viat_id' is not null
      on conflict (viat_id) do update set
        matricula = excluded.matricula, datahora = excluded.datahora, latitude = excluded.latitude,
        longitude = excluded.longitude, velocidade_kmh = excluded.velocidade_kmh, ignicao = excluded.ignicao,
        rua = excluded.rua, odometro = excluded.odometro, veiculo_id = excluded.veiculo_id, atualizado_em = now();

      -- trajeto só dos veículos acompanhados (cadastrados na Frota ou marcados pelo supervisor)
      insert into geocar_posicoes (viat_id, registrado_em, latitude, longitude, velocidade_kmh, ignicao, rua)
      select viat_id, datahora, latitude, longitude, velocidade_kmh, ignicao, rua
        from geocar_viaturas
       where (seguir or veiculo_id is not null) and datahora is not null and latitude is not null
         and datahora > now() - interval '1 day'
      on conflict do nothing;
    end if;
  end if;

  -- 2) pede a posição atual de novo
  select decrypted_secret::jsonb into v_acesso from vault.decrypted_secrets where name = 'geocar_acesso' limit 1;
  if v_acesso is null then return; end if;
  v_req := net.http_post(
    url := 'https://webservices.geocar.info/public/geocar/get_viats_data.json?api_key=' || (v_acesso->>'api_key'),
    body := jsonb_build_object('user', v_acesso->>'user', 'pwd', v_acesso->>'pwd'),
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
    timeout_milliseconds := 30000
  );
  insert into interno.geocar_pedido (id, req_id, enviado_em) values (1, v_req, now())
  on conflict (id) do update set req_id = excluded.req_id, enviado_em = excluded.enviado_em;
end $$;

revoke execute on function interno.geocar_sincronizar() from public;

create or replace function interno.geocar_limpar() returns void
language sql security definer set search_path = public
as $$ delete from geocar_posicoes where registrado_em < now() - interval '120 days' $$;

select cron.schedule('geocar-sync', '*/2 * * * *', 'select interno.geocar_sincronizar()');
select cron.schedule('geocar-limpar', '30 6 * * *', 'select interno.geocar_limpar()');
