-- "Preventiva" passa a se chamar "Preventiva rede" e cada tipo ganha uma lista de atividades
-- (o supervisor mantém no painel; o técnico marca no app ao abrir a preventiva).
update ordens_servico set tipo = 'Preventiva rede' where tipo = 'Preventiva';

alter policy os_tecnico_abre_preventiva on ordens_servico
  with check (
    tecnico_id = auth.uid()
    and criada_por = auth.uid()
    and tipo in ('Preventiva rede', 'Preventiva site')
    and status = 'em_execucao'
  );

create table atividades_preventiva (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('Preventiva rede', 'Preventiva site')),
  nome text not null,
  ordem int not null default 0,
  ativo boolean not null default true,
  unique (tipo, nome)
);

alter table atividades_preventiva enable row level security;
create policy atividades_preventiva_le on atividades_preventiva for select to authenticated using (true);
create policy atividades_preventiva_supervisor on atividades_preventiva for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());

insert into atividades_preventiva (tipo, nome, ordem) values
  ('Preventiva rede', 'Inspeção visual do cabo e ferragens', 1),
  ('Preventiva rede', 'Verificação das caixas de emenda', 2),
  ('Preventiva rede', 'Verificação das sobras técnicas', 3),
  ('Preventiva rede', 'Verificação de flechas e travessias', 4),
  ('Preventiva rede', 'Verificação de postes e ancoragens', 5),
  ('Preventiva rede', 'Poda / limpeza de vegetação', 6),
  ('Preventiva rede', 'Conferência de plaquetas de identificação', 7),
  ('Preventiva rede', 'Medição OTDR', 8),
  ('Preventiva site', 'Limpeza do site / POP', 1),
  ('Preventiva site', 'Verificação de DIO, bastidor e cordões', 2),
  ('Preventiva site', 'Verificação de energia (retificador e baterias)', 3),
  ('Preventiva site', 'Verificação da climatização', 4),
  ('Preventiva site', 'Verificação do aterramento', 5),
  ('Preventiva site', 'Infraestrutura (acesso, cadeado, iluminação)', 6),
  ('Preventiva site', 'Medição de potência óptica', 7),
  ('Preventiva site', 'Organização e identificação de cabos', 8);
