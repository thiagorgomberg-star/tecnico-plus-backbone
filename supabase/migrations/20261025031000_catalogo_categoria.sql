-- O catálogo separa serviços executados e materiais utilizados.
alter table itens_execucao add column categoria text not null default 'servico'
  check (categoria in ('servico', 'material'));
