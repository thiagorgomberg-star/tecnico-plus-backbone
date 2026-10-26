import { OfflineManager, type OfflinePack } from '@maplibre/maplibre-react-native';

// Mapa de fundo (ruas, rios, cidades) do OpenFreeMap, em vetor: arquivos pequenos, baixa bem nos dados móveis.
export const ESTILO_MAPA = 'https://tiles.openfreemap.org/styles/liberty';
export const mapaNativoDisponivel = true;

type Ponto = { lat: number; lng: number };
const CELULA = 0.1; // ~11 km de lado
const MAX_NOVAS = 40; // por vez, para não gastar muitos dados de uma só

let baixando = false;

// Guarda no celular o mapa em volta das caixas da rede e do backlog (quadrados de ~11 km, até o zoom de rua)
// e uma visão geral da região toda. Só baixa o que ainda não está guardado; sem sinal, tenta na próxima abertura.
export async function baixarMapaOffline(pontos: Ponto[]) {
  const validos = pontos.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && (p.lat !== 0 || p.lng !== 0));
  if (baixando || !validos.length) return;
  baixando = true;
  try {
    OfflineManager.setTileCountLimit(20000);
    const packs = await OfflineManager.getPacks();
    const porNome = new Map(packs.map((p) => [String(p.metadata?.nome ?? ''), p]));

    const lats = validos.map((p) => p.lat), lngs = validos.map((p) => p.lng);
    const arred = (v: number, f: (x: number) => number) => f(v * 2) / 2;
    const geral: [number, number, number, number] = [
      arred(Math.min(...lngs) - 0.3, Math.floor), arred(Math.min(...lats) - 0.3, Math.floor),
      arred(Math.max(...lngs) + 0.3, Math.ceil), arred(Math.max(...lats) + 0.3, Math.ceil),
    ];
    const pedidos: { nome: string; bounds: [number, number, number, number]; minZoom: number; maxZoom: number }[] = [
      { nome: `geral:${geral.join(',')}`, bounds: geral, minZoom: 5, maxZoom: 10 },
    ];
    const celulas = new Set(validos.map((p) => `${Math.floor(p.lat / CELULA)}:${Math.floor(p.lng / CELULA)}`));
    for (const c of celulas) {
      const [i, j] = c.split(':').map(Number);
      const m = 0.02; // folga para a borda do quadrado
      pedidos.push({ nome: `area:${c}`, bounds: [j * CELULA - m, i * CELULA - m, (j + 1) * CELULA + m, (i + 1) * CELULA + m], minZoom: 11, maxZoom: 14 });
    }

    // Visão geral antiga (a rede cresceu): troca pela nova.
    for (const p of packs) {
      const nome = String(p.metadata?.nome ?? '');
      if (nome.startsWith('geral:') && nome !== pedidos[0].nome) await OfflineManager.deletePack(p.id).catch(() => undefined);
    }

    let novas = 0;
    for (const ped of pedidos) {
      const existente = porNome.get(ped.nome);
      if (existente) {
        const st = await existente.status().catch(() => null);
        if (st && st.state !== 'complete' && st.percentage < 100) {
          if (!(await esperar(existente))) break;
        }
        continue;
      }
      if (novas++ >= MAX_NOVAS) break;
      const ok = await new Promise<boolean>((resolve) => {
        let fim = false;
        const terminar = (v: boolean) => { if (!fim) { fim = true; clearTimeout(t); resolve(v); } };
        const t = setTimeout(() => terminar(false), 3 * 60_000);
        OfflineManager.createPack(
          { mapStyle: ESTILO_MAPA, bounds: ped.bounds, minZoom: ped.minZoom, maxZoom: ped.maxZoom, metadata: { nome: ped.nome } },
          (_pack, st) => { if (st.state === 'complete' || st.percentage >= 100) terminar(true); },
          () => terminar(false),
        ).catch(() => terminar(false));
      });
      if (!ok) break; // perdeu o sinal: o resto fica para a próxima
    }
  } catch {
    // sem sinal ou módulo do mapa indisponível
  } finally {
    baixando = false;
  }
}

// Retoma um download que ficou pela metade.
async function esperar(pack: OfflinePack) {
  try {
    await pack.resume();
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const st = await pack.status();
      if (st.state === 'complete' || st.percentage >= 100) return true;
      if (st.state === 'inactive') return false;
    }
  } catch { /* ignora */ }
  return false;
}
