-- Escala: "Manutenção do carro" e "Folga interjornada" para justificar o dia sem O.S.
-- Folga interjornada é ausência (bloqueia iniciar expediente, não conta falta); manutenção do carro não bloqueia.
-- Aplicado em dois passos (o valor novo do enum só pode ser usado depois do commit).
alter type tipo_escala add value if not exists 'manutencao_carro';
alter type tipo_escala add value if not exists 'folga_interjornada';
