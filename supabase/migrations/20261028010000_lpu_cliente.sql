-- LPU por cliente: itens de serviço que só valem para as O.S. de um cliente (ex.: Master-C.C, casa do cliente),
-- com valor unitário padrão. O lançamento guarda o valor usado, que o técnico ou o supervisor pode ajustar.
alter table itens_execucao add column if not exists cliente_id uuid references clientes (id);
alter table itens_execucao add column if not exists valor numeric(12, 2);
alter table os_servicos_executados add column if not exists valor_unitario numeric(12, 2);

insert into itens_execucao (nome, unidade, ordem, categoria, cliente_id, valor)
select v.nome, 'un', v.ordem, 'servico', c.id, v.valor
  from clientes c
  cross join (values
    ('CONEXÃO TRANSFERÊNCIA DE ENDEREÇO FIBRA', 1, 30.00),
    ('DESCONEXÃO TRANSFERÊNCIA DE ENDEREÇO FIBRA', 2, 35.00),
    ('INSTALAÇÃO PONTO PLUS FIBRA', 3, 35.00),
    ('MANUTENÇÃO INTERNET FIBRA LINK LOS', 4, 35.00),
    ('MANUTENÇÃO INTERNET FIBRA LINK OK', 5, 50.00),
    ('MANUTENÇÃO INTERNET TROCA DE DROP', 6, 80.00),
    ('PREVENTIVA CST', 7, 80.00),
    ('PRIMEIRA CONEXÃO', 8, 30.00),
    ('TRANSFERÊNCIA PONTO INTERNO CHAT FIBRA', 9, 30.00),
    ('TROCA DE ROTEADOR (UPGRADE/DOWNGRADE)', 10, 15.00),
    ('TROCA DE SENHA DE ROTEADOR', 11, null),
    ('VISTORIA TÉCNICA', 12, null),
    ('DIFERENÇA TROCA DE DROP MÊS ANTERIOR', 13, 15.00)
  ) as v (nome, ordem, valor)
 where c.nome = 'Master-C.C'
on conflict (nome) do nothing;
