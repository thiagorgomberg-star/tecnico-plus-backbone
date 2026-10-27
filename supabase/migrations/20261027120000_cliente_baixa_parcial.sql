-- Baixa parcial por cliente: o supervisor marca o OK de cada cliente com o horário em que o sinal voltou
-- e quando/quem do NOC dele confirmou.
alter table os_clientes
  add column restabelecido_em timestamptz,
  add column noc_confirmado_em timestamptz,
  add column noc_contato text;
