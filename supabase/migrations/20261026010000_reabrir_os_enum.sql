-- Reabertura de O.S. encerrada: novo tipo de alerta e campos de registro.
alter type tipo_alerta add value if not exists 'os_reaberta';
alter table ordens_servico add column if not exists reaberta_em timestamptz;
alter table ordens_servico add column if not exists reaberta_motivo text;
alter table os_eventos add column if not exists observacao text;
