-- Deslocamento completo dos carros: além da posição atual (a cada 2 min), busca na GEOCAR o histórico
-- ponto a ponto (get_viat_old_data) de cada carro dos técnicos desde a última busca, a cada 5 min.

create table interno.geocar_historico (
  viat_id integer primary key,
  ate timestamptz,          -- histórico já gravado até aqui
  req_id bigint,            -- pedido em andamento
  pedido_ate timestamptz,
  pedido_em timestamptz
);

create or replace function interno.geocar_buscar_historico() returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  r record;
  v_resp jsonb;
  v_acesso jsonb;
  v_de timestamptz;
  v_req bigint;
begin
  -- 1) grava as respostas que já chegaram
  for r in select * from interno.geocar_historico where req_id is not null loop
    v_resp := null;
    begin
      select content::jsonb into v_resp from net._http_response where id = r.req_id and status_code = 200;
    exception when others then
      v_resp := null;
    end;
    if v_resp->>'status' = '1' then
      insert into geocar_posicoes (viat_id, registrado_em, latitude, longitude, velocidade_kmh, ignicao, rua)
      select r.viat_id,
             to_timestamp(d->>'datahora', 'DD-MM-YYYY HH24:MI:SS')::timestamp at time zone 'UTC',
             (d->>'viat_lat')::float8, (d->>'viat_lon')::float8,
             nullif(d->>'viat_velocidade', '')::int, (d->>'viat_ignicao') = '1', d->>'viat_rua'
        from jsonb_array_elements(case jsonb_typeof(v_resp->'result') when 'array' then v_resp->'result' else jsonb_build_array(v_resp->'result') end) res,
             jsonb_array_elements(coalesce(res->'dados', '[]'::jsonb)) d
       where nullif(d->>'viat_lat', '') is not null and nullif(d->>'viat_lon', '') is not null
      on conflict do nothing;
      update interno.geocar_historico set ate = pedido_ate, req_id = null where viat_id = r.viat_id;
    elsif v_resp is not null or r.pedido_em < now() - interval '10 minutes' then
      update interno.geocar_historico set req_id = null where viat_id = r.viat_id; -- erro: tenta de novo na próxima
    end if;
  end loop;

  -- 2) pede o trecho novo de cada carro dos técnicos (no máximo 47 h, limite da API é 48 h)
  select decrypted_secret::jsonb into v_acesso from vault.decrypted_secrets where name = 'geocar_acesso' limit 1;
  if v_acesso is null then return; end if;
  for r in
    select g.viat_id, h.ate
      from geocar_viaturas g
      join veiculos v on v.id = g.veiculo_id and v.ativo and v.tecnico_id is not null
      left join interno.geocar_historico h on h.viat_id = g.viat_id
     where h.req_id is null
  loop
    v_de := greatest(coalesce(r.ate - interval '5 minutes', date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
                     now() - interval '47 hours');
    v_req := net.http_post(
      url := 'https://webservices.geocar.info/public/geocar/get_viat_old_data.json?api_key=' || (v_acesso->>'api_key'),
      body := jsonb_build_object('user', v_acesso->>'user', 'pwd', v_acesso->>'pwd', 'viat_id', r.viat_id,
                                 'dh_ini', to_char(v_de at time zone 'UTC', 'YYYY-MM-DD HH24:MI'),
                                 'dh_end', to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI')),
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
      timeout_milliseconds := 30000
    );
    insert into interno.geocar_historico (viat_id, req_id, pedido_ate, pedido_em) values (r.viat_id, v_req, now(), now())
    on conflict (viat_id) do update set req_id = excluded.req_id, pedido_ate = excluded.pedido_ate, pedido_em = excluded.pedido_em;
  end loop;
end $$;

revoke execute on function interno.geocar_buscar_historico() from public;

select cron.schedule('geocar-historico', '1-59/5 * * * *', 'select interno.geocar_buscar_historico()');
