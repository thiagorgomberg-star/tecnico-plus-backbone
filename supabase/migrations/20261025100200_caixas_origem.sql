-- De onde vem a caixa: caixa anterior (e qual saída dela) ou DGO. A entrada da caixa nova
-- é preenchida com as fibras da saída da anterior.
alter table caixas_emenda
  add column origem_caixa_id uuid references caixas_emenda (id) on delete set null,
  add column origem_saida integer check (origem_saida > 0),
  add column origem_dgo text;
