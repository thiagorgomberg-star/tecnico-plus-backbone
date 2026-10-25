-- Aviso ao técnico mais próximo quando entra no backlog uma O.S. de prioridade alta.
alter type tipo_alerta add value if not exists 'backlog_proximo';
