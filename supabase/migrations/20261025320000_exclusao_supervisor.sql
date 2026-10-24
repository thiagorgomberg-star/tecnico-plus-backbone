-- Técnico removido sem apagar o histórico (O.S., caixas, fotos ficam com o nome dele):
-- some das listas e perde o acesso. A exclusão em si roda na função excluir-dados.
alter table usuarios add column if not exists excluido_em timestamptz;
