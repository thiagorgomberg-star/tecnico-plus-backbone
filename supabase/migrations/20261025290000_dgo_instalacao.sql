-- Instalação do DGO: container, rooftop ou site de outro parceiro (nome em `parceiro`).
alter table caixas_emenda drop constraint caixas_emenda_instalacao_check;
alter table caixas_emenda add constraint caixas_emenda_instalacao_check
  check (instalacao in ('aerea', 'subterranea', 'container', 'rooftop', 'site_parceiro'));
