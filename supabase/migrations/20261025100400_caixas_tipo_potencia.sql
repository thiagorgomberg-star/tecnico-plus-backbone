-- Ponto da rede: caixa de emenda, caixa de entroncamento ou DGO; e o sinal que chega em cada fibra (dBm).
alter table caixas_emenda add column tipo text not null default 'emenda'
  check (tipo in ('emenda', 'entroncamento', 'dgo'));
alter table caixa_fibras add column potencia_dbm numeric(6, 2);
-- (a view caixas_mapa foi recriada com tipo, os_id e potencia_dbm em fibras; ver definição aplicada no projeto)
