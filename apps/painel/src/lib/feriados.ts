// Feriados nacionais (fixos e móveis pela Páscoa), no formato AAAA-MM-DD.
export function feriadosNacionais(ano: number): Set<string> {
  // Páscoa pelo algoritmo de Meeus/Jones/Butcher.
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mesPascoa = Math.floor((h + l - 7 * m + 114) / 31), diaPascoa = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = new Date(ano, mesPascoa - 1, diaPascoa);
  const desloca = (dias: number) => new Date(ano, pascoa.getMonth(), pascoa.getDate() + dias);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map((md) => `${ano}-${md}`);
  // Carnaval (segunda e terça), Sexta-feira Santa e Corpus Christi.
  const moveis = [-48, -47, -2, 60].map((n) => iso(desloca(n)));
  return new Set([...fixos, ...moveis]);
}
