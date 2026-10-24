alter table caixa_fibras
  add column reflexao_db numeric(6, 2),
  add column perda_db_km numeric(6, 3);
alter table os_anexos add column fibra integer check (fibra > 0);
