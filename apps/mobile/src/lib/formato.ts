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
