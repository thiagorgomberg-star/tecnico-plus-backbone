-- Trechos por região (MG, SP ou outra). Só o supervisor inclui, exclui ou desativa (políticas da tabela rotas).
-- O app passa a montar a lista de trechos da vistoria a partir daqui. O link do KMZ pode ficar vazio.
alter table rotas add column if not exists regiao text not null default 'MG';

insert into rotas (trecho, regiao, link_kmz)
select t.trecho, t.regiao, ''
  from (values
    ('BB-08 · Campos do Jordão × Itajubá', 'MG'), ('BB-09 · Itajubá × Maria da Fé', 'MG'),
    ('BB-10 · Carmo de Minas × São Lourenço', 'MG'), ('BB-11 · Maria da Fé × Carmo de Minas', 'MG'),
    ('BB-12 · Carmo de Minas × Lambari', 'MG'), ('BB-13 · Lambari × Heliodora × Careaçu', 'MG'),
    ('BB-14 · Pedralva × Santa Rita do Sapucaí', 'MG'), ('BB-15 · Santa Rita do Sapucaí × Pouso Alegre', 'MG'),
    ('SJC · São José dos Campos', 'SP'), ('Taubaté', 'SP'), ('SP · São Paulo', 'SP')
  ) as t (trecho, regiao)
 where not exists (select 1 from rotas r where r.trecho = t.trecho);
