-- Potência TX/RX opcional digitada em cada curva (o .SOR não traz).
alter table curvas_analisadas add column if not exists potencia_tx_dbm numeric, add column if not exists potencia_rx_dbm numeric;
