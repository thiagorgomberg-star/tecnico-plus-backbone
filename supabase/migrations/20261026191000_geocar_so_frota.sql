-- Só os carros cadastrados na Frota para os nossos técnicos (placa igual à da GEOCAR) entram no sistema;
-- os outros carros da conta GEOCAR são ignorados. A coluna seguir deixou de ser usada.

alter policy geocar_viaturas_seguir on geocar_viaturas using (false) with check (false);

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
             v.id,
             now()
        from jsonb_array_elements(v_resp->'result') e
        join veiculos v on v.ativo and v.tecnico_id is not null
                       and interno.placa_normal(v.placa) = interno.placa_normal(e->>'viat_matricula')
       where e->>'viat_id' is not null
      on conflict (viat_id) do update set
        matricula = excluded.matricula, datahora = excluded.datahora, latitude = excluded.latitude,
        longitude = excluded.longitude, velocidade_kmh = excluded.velocidade_kmh, ignicao = excluded.ignicao,
        rua = excluded.rua, odometro = excluded.odometro, veiculo_id = excluded.veiculo_id, atualizado_em = now();

      -- trajeto dos carros dos técnicos (carro que saiu da Frota ou do técnico para de receber pontos e mantém o histórico)
      insert into geocar_posicoes (viat_id, registrado_em, latitude, longitude, velocidade_kmh, ignicao, rua)
      select g.viat_id, g.datahora, g.latitude, g.longitude, g.velocidade_kmh, g.ignicao, g.rua
        from geocar_viaturas g
        join veiculos v on v.id = g.veiculo_id and v.ativo and v.tecnico_id is not null
       where g.datahora is not null and g.latitude is not null
         and g.datahora > now() - interval '1 day'
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


select cron.alter_job((select jobid from cron.job where jobname = 'geocar-sync'), active := true);
