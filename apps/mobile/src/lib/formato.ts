const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const doisDigitos = (n: number) => String(n).padStart(2, '0');

export const hora = (d: Date) => `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
export const dataCurta = (d: Date) => `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
export const diaSemana = (d: Date) => DIAS[d.getDay()];

// 23°12'57"S no padrão da máscara de fotos.
function grausMinutosSegundos(valor: number, positivo: string, negativo: string) {
  const abs = Math.abs(valor);
  const graus = Math.floor(abs);
  const minutos = Math.floor((abs - graus) * 60);
  const segundos = Math.round(((abs - graus) * 60 - minutos) * 60);
  return `${graus}°${minutos}'${segundos}"${valor >= 0 ? positivo : negativo}`;
}

export const latLong = (latitude: number, longitude: number) =>
  `${grausMinutosSegundos(latitude, 'N', 'S')}, ${grausMinutosSegundos(longitude, 'E', 'W')}`;

// SLA de 4h a partir do cadastro da O.S.: "SLA 2h15 restantes" ou "SLA vencido há 30 min".
export function textoSla(limite: string, agora = new Date()) {
  const minutos = Math.round((new Date(limite).getTime() - agora.getTime()) / 60000);
  const duracao = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`);
  return minutos >= 0
    ? { texto: `SLA ${duracao(minutos)} restantes`, nivel: minutos <= 60 ? 'alerta' : 'ok' }
    : { texto: `SLA vencido há ${duracao(-minutos)}`, nivel: 'vencido' };
}
