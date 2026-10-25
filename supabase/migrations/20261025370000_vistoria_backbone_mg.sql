-- Vistoria Backbone MG: o técnico registra poste a poste (rede aérea em poste de madeira próprio) e as
-- ocorrências da rota, com GPS e foto. As caixas continuam no cadastro de caixas que já existe.
-- O painel soma a produção do dia e guarda o planejamento da vistoria com andamento atualizado à mão.

-- 1) Novo tipo de atividade que o próprio técnico abre em campo.
alter policy os_tecnico_abre_preventiva on ordens_servico
  with check (
    tecnico_id = auth.uid()
    and criada_por = auth.uid()
    and tipo in ('Preventiva rede', 'Preventiva site', 'Vistoria Backbone MG')
    and status = 'em_execucao'
  );

alter table atividades_preventiva drop constraint if exists atividades_preventiva_tipo_check;
alter table atividades_preventiva add constraint atividades_preventiva_tipo_check
  check (tipo in ('Preventiva rede', 'Preventiva site', 'Vistoria Backbone MG'));

insert into atividades_preventiva (tipo, nome, ordem) values
  ('Vistoria Backbone MG', 'Registro de postes (estado da base, inclinação, estai)', 1),
  ('Vistoria Backbone MG', 'Identificação do tipo de via (rodovia, vicinal, urbana)', 2),
  ('Vistoria Backbone MG', 'Cadastro das caixas com TAG, fotos e GPS', 3),
  ('Vistoria Backbone MG', 'Abertura das caixas-chave e ocupação das fibras', 4),
  ('Vistoria Backbone MG', 'Medição OTDR a partir do POP', 5),
  ('Vistoria Backbone MG', 'Cabo exposto, flecha baixa e travessias', 6),
  ('Vistoria Backbone MG', 'Reserva técnica', 7),
  ('Vistoria Backbone MG', 'Vegetação / poda', 8)
on conflict (tipo, nome) do nothing;

-- 2) Foto de um ponto da vistoria (poste ou ocorrência).
alter type tipo_anexo add value if not exists 'foto_ponto';

-- 3) Pontos da vistoria.
create table vistoria_pontos (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references ordens_servico (id) on delete cascade,
  categoria text not null check (categoria in ('poste', 'ocorrencia')),
  identificacao text,                       -- número/plaqueta do poste ou referência
  posicao extensions.geography(point, 4326),
  precisao_m real,
  localizada_em timestamptz,
  endereco text,
  -- Poste
  material text check (material in ('madeira', 'eucalipto_tratado', 'concreto', 'metalico', 'outro')),
  estado_base text check (estado_base in ('ok', 'podre', 'cupim', 'erosao')),
  inclinado boolean,
  rachado boolean,
  estai text check (estai in ('ok', 'frouxo', 'ausente', 'nao_tem')),
  precisa_troca boolean not null default false,
  -- Onde está (define com quem licenciar)
  tipo_via text check (tipo_via in ('rodovia_federal', 'rodovia_estadual', 'concessionaria', 'vicinal', 'urbana', 'particular')),
  via_nome text,                            -- ex.: BR-381 km 812, MG-347
  -- Ocorrência
  ocorrencia text check (ocorrencia in ('cabo_exposto', 'flecha_baixa', 'vegetacao', 'travessia', 'reserva_tecnica',
                                         'cabo_danificado', 'ferragem', 'roedor', 'outro')),
  gravidade text check (gravidade in ('baixa', 'media', 'alta')),
  observacao text,
  criada_por uuid not null references usuarios (id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (categoria <> 'ocorrencia' or ocorrencia is not null)
);
create index vistoria_pontos_os_idx on vistoria_pontos (os_id);
create index vistoria_pontos_data_idx on vistoria_pontos (localizada_em);

create trigger vistoria_pontos_atualizado before update on vistoria_pontos
  for each row execute function caixas_toca_atualizado();

alter table os_anexos add column ponto_id uuid references vistoria_pontos (id) on delete set null;

alter table vistoria_pontos enable row level security;
create policy vistoria_pontos_ler on vistoria_pontos for select to authenticated using (true);
create policy vistoria_pontos_tecnico_insere on vistoria_pontos for insert to authenticated
  with check (criada_por = auth.uid() and os_em_campo_comigo(os_id));
create policy vistoria_pontos_tecnico_altera on vistoria_pontos for update to authenticated
  using (os_em_campo_comigo(os_id)) with check (os_em_campo_comigo(os_id));
create policy vistoria_pontos_tecnico_remove on vistoria_pontos for delete to authenticated
  using (criada_por = auth.uid() and os_em_campo_comigo(os_id));
create policy vistoria_pontos_supervisor on vistoria_pontos for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());

-- Para o painel e o app: coordenadas prontas e dados da O.S.
create view vistoria_pontos_mapa with (security_invoker = true) as
select p.id, p.os_id, p.categoria, p.identificacao, p.endereco, p.precisao_m, p.localizada_em,
       p.material, p.estado_base, p.inclinado, p.rachado, p.estai, p.precisa_troca, p.tipo_via, p.via_nome,
       p.ocorrencia, p.gravidade, p.observacao, p.criado_em, p.atualizado_em,
       extensions.st_y(p.posicao::extensions.geometry) as latitude,
       extensions.st_x(p.posicao::extensions.geometry) as longitude,
       o.numero as os_numero, o.titulo as os_titulo, o.tecnico_id, u.nome as tecnico
  from vistoria_pontos p
  join ordens_servico o on o.id = p.os_id
  left join usuarios u on u.id = o.tecnico_id;

-- 4) Planejamento da vistoria (o supervisor atualiza o andamento à mão no painel).
create table vistoria_planejamento (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  trecho text not null,
  atividade text not null,
  base text,
  equipe text,
  status text not null default 'planejado' check (status in ('planejado', 'em_andamento', 'concluido', 'adiado')),
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index vistoria_planejamento_data_idx on vistoria_planejamento (data);
create trigger vistoria_planejamento_atualizado before update on vistoria_planejamento
  for each row execute function caixas_toca_atualizado();

alter table vistoria_planejamento enable row level security;
create policy vistoria_planejamento_ler on vistoria_planejamento for select to authenticated using (true);
create policy vistoria_planejamento_supervisor on vistoria_planejamento for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());

-- Fase 1 – Sul de Minas (09/11 a 27/11/2026), saindo pela Fernão Dias.
insert into vistoria_planejamento (data, trecho, atividade, base, equipe) values
  ('2026-11-09', 'BB-13', 'Deslocamento SJC → Careaçu. POP Careaçu: abordagens (Lumen, Claro, Novalink, TIM). Travessia até a Lumen.', 'Careaçu / Pouso Alegre', 'Thiago + técnico + auxiliar'),
  ('2026-11-10', 'BB-13', 'Careaçu → Heliodora: postes, caixas-chave e OTDR a partir do POP Careaçu.', 'Careaçu / Pouso Alegre', 'Thiago + técnico + auxiliar'),
  ('2026-11-11', 'BB-13', 'Heliodora → Lambari (Heliodora Online). Fechar BB-13.', 'Lambari', 'Thiago + técnico + auxiliar'),
  ('2026-11-12', 'BB-12', 'Lambari → Carmo de Minas + OTDR. Confirmar pontas do trecho com roedores.', 'Lambari / São Lourenço', 'Thiago + técnico + auxiliar'),
  ('2026-11-13', 'BB-12', 'Lançamento de ~900 m de cabo anti-roedor.', 'São Lourenço', 'Thiago + técnico + auxiliar'),
  ('2026-11-16', 'BB-12', 'Fusões nas pontas, OTDR/certificação, retirada do cabo antigo (avisar TIM e clientes).', 'São Lourenço', 'Thiago + técnico + auxiliar'),
  ('2026-11-17', 'BB-10', 'Carmo → São Lourenço. CEO a ser abordada pelo site 5G MGSLR01.', 'São Lourenço', 'Thiago + técnico + auxiliar'),
  ('2026-11-18', 'BB-11', 'Carmo → Cristina (Angosnet). Verificar rota Vargem Alegre.', 'Cristina / São Lourenço', 'Thiago + técnico + auxiliar'),
  ('2026-11-19', 'BB-11', 'Cristina → Maria da Fé. Ligação com o ramal de Pedralva.', 'Maria da Fé / Itajubá', 'Thiago + técnico + auxiliar'),
  ('2026-11-23', 'BB-09', 'Maria da Fé → Itajubá. POP UNA/Multivale; CEO a ser abordada pelo site 5G MGITJ1E.', 'Itajubá', 'Thiago + técnico + auxiliar'),
  ('2026-11-24', 'BB-14', 'Ligação rota principal → Pedralva (~14 km) e início Pedralva → Santa Rita.', 'Santa Rita do Sapucaí', 'Thiago + técnico + auxiliar'),
  ('2026-11-25', 'BB-14', 'Conclusão Pedralva → Santa Rita. Torres TIM Santa Rita.', 'Santa Rita do Sapucaí', 'Thiago + técnico + auxiliar'),
  ('2026-11-26', 'BB-15', 'Santa Rita → Pouso Alegre. Torre TIM Pouso Alegre, CEOs Claro.', 'Pouso Alegre', 'Thiago + técnico + auxiliar'),
  ('2026-11-27', 'BB-15', 'Conclusão BB-15, KMZ/as-built, clientes Virtual Net/Alares/Crisnet. Retorno.', '—', 'Thiago + técnico + auxiliar'),
  ('2026-11-30', 'Reserva', 'Contingência para pendências/chuva.', 'A definir', 'Thiago + técnico + auxiliar');
