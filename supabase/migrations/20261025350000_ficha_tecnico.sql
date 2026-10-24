-- Ficha completa do técnico, preenchida pelo supervisor no painel (Equipe > nome do técnico).
-- usuarios só é lido pelo próprio usuário e pelo supervisor.
alter table usuarios
  add column if not exists cpf text,
  add column if not exists rg text,
  add column if not exists data_nascimento date,
  add column if not exists email_contato text,
  add column if not exists endereco text,
  add column if not exists cnh_numero text,
  add column if not exists cnh_categoria text,
  add column if not exists cnh_validade date,
  add column if not exists data_admissao date,
  add column if not exists contato_emergencia text,
  add column if not exists telefone_emergencia text,
  add column if not exists tamanho_camisa text,
  add column if not exists tamanho_calca text,
  add column if not exists tamanho_calcado text,
  add column if not exists observacao text;

-- "documento" (antigo) fica como reserva; a ficha usa cpf e rg.
