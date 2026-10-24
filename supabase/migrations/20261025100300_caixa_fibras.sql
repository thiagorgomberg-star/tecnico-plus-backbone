-- Situação de cada fibra de entrada da caixa: cliente alocado ou sem potência.
create table caixa_fibras (
  caixa_id uuid not null references caixas_emenda (id) on delete cascade,
  fibra integer not null check (fibra > 0),
  cliente text,
  sem_potencia boolean not null default false,
  atualizado_por uuid not null references usuarios (id) default auth.uid(),
  atualizado_em timestamptz not null default now(),
  primary key (caixa_id, fibra)
);

alter table caixa_fibras enable row level security;
create policy fibras_ler on caixa_fibras for select to authenticated using (true);
create policy fibras_tecnico_insere on caixa_fibras for insert to authenticated
  with check (atualizado_por = auth.uid() and exists (
    select 1 from caixas_emenda c where c.id = caixa_id and os_em_campo_comigo(c.os_id)));
create policy fibras_tecnico_altera on caixa_fibras for update to authenticated
  using (exists (select 1 from caixas_emenda c where c.id = caixa_id and os_em_campo_comigo(c.os_id)))
  with check (atualizado_por = auth.uid() and exists (
    select 1 from caixas_emenda c where c.id = caixa_id and os_em_campo_comigo(c.os_id)));
create policy fibras_tecnico_remove on caixa_fibras for delete to authenticated
  using (exists (select 1 from caixas_emenda c where c.id = caixa_id and os_em_campo_comigo(c.os_id)));
create policy fibras_supervisor on caixa_fibras for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table caixa_fibras;
  end if;
end $$;

create or replace view caixas_mapa with (security_invoker = true) as
select c.id, c.identificacao, c.capacidade_fibras, c.saidas, c.grupos_fusionados, c.grupos_vagos, c.observacao, c.endereco,
       c.localizada_em, c.precisao_m, c.atualizado_em,
       extensions.st_y(c.posicao::extensions.geometry) as latitude,
       extensions.st_x(c.posicao::extensions.geometry) as longitude,
       o.numero as os_numero, o.ticket_acionamento, r.trecho,
       u.nome as tecnico,
       coalesce((select jsonb_agg(jsonb_build_object('fibra_entrada', m.fibra_entrada, 'saida', m.saida, 'fibra_saida', m.fibra_saida, 'motivo', m.motivo) order by m.fibra_entrada)
                   from caixa_manobras m where m.caixa_id = c.id), '[]'::jsonb) as manobras,
       c.origem_caixa_id, c.origem_saida, c.origem_dgo, ant.identificacao as origem_identificacao,
       coalesce((select jsonb_agg(jsonb_build_object('fibra', f.fibra, 'cliente', f.cliente, 'sem_potencia', f.sem_potencia) order by f.fibra)
                   from caixa_fibras f where f.caixa_id = c.id), '[]'::jsonb) as fibras
  from caixas_emenda c
  join ordens_servico o on o.id = c.os_id
  left join rotas r on r.id = o.rota_id
  left join usuarios u on u.id = c.criada_por
  left join caixas_emenda ant on ant.id = c.origem_caixa_id;
