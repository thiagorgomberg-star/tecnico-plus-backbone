-- Alerta para o supervisor quando o técnico marca "Visualizei a O.S.".
alter type tipo_alerta add value if not exists 'os_visualizada';
