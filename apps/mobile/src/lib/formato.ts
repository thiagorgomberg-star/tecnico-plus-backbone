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

// O.S. sem SLA (ocorrências e correções da preventiva): idade desde a abertura. Até 24h verde, até 48h amarelo,
// depois vermelho (72h é o limite de referência).
export function idadeOs(criadoEm: string, agora = new Date()) {
  const horas = Math.max(0, (agora.getTime() - new Date(criadoEm).getTime()) / 3_600_000);
  const texto = horas < 1 ? `${Math.max(1, Math.round(horas * 60))} min` : horas < 48 ? `${Math.floor(horas)}h` : `${Math.floor(horas / 24)}d ${Math.floor(horas % 24)}h`;
  const nivel: 'verde' | 'amarelo' | 'vermelho' = horas < 24 ? 'verde' : horas < 48 ? 'amarelo' : 'vermelho';
  return { horas, texto, nivel, cor: nivel === 'verde' ? '#1E9E4A' : nivel === 'amarelo' ? '#D99A00' : '#D0453B' };
}
