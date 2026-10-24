-- Padrão de cores só existe quando o técnico informa (o app abre a caixa vazia).
alter table caixas_emenda alter column padrao_cores_entrada drop not null;
alter table caixas_emenda alter column padrao_cores_entrada drop default;
