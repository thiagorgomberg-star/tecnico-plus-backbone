-- Nas pontas (DGO / entroncamento): reflexão e perda por km de cada fibra, com foto da tela do OTDR
-- (os_anexos tipo foto_otdr com caixa_id e fibra). A view caixas_mapa passou a trazer esses campos em "fibras".
alter type tipo_anexo add value if not exists 'foto_otdr';
