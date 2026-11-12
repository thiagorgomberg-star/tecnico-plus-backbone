// Gera um PDF A4 deitado a partir de pedaços da tela, quebrando em páginas.
// O conteúdo é sempre desenhado numa largura fixa de computador (LARGURA_PX), para sair igual no celular e no PC
// (no celular a tela estreita cortava colunas e espalhava o relatório por dezenas de folhas).
// As quebras de página caem entre linhas/blocos, nunca no meio de uma linha da tabela.
// Com mais de um elemento (ex.: análise e parecer), cada um começa numa página nova.
const LARGURA_PX = 1120;
const BLOCOS = "tr, figure, p, h1, h2, h3, svg, img, table, [style*='break-inside']";

export async function pdfDoElemento(els: HTMLElement | HTMLElement[]): Promise<Blob> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margem = 8;
  const largura = doc.internal.pageSize.getWidth() - 2 * margem;
  const alturaPagina = doc.internal.pageSize.getHeight() - 2 * margem;
  let primeira = true;
  for (const el of Array.isArray(els) ? els : [els]) {
    // Cópia fora da tela, na largura fixa.
    const palco = document.createElement("div");
    Object.assign(palco.style, { position: "fixed", left: "-20000px", top: "0", width: `${LARGURA_PX}px`, background: "#fff", zIndex: "-1" });
    const copia = el.cloneNode(true) as HTMLElement;
    Object.assign(copia.style, { width: `${LARGURA_PX}px`, maxWidth: "none", overflow: "visible" });
    palco.appendChild(copia);
    document.body.appendChild(palco);
    try {
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      const topo = copia.getBoundingClientRect().top;
      const alturaCss = copia.scrollHeight;
      // Fins de cada bloco (em px de CSS a partir do topo): pontos bons para quebrar a página.
      const fins = [...new Set(Array.from(copia.querySelectorAll(BLOCOS)).map((b) => Math.round(b.getBoundingClientRect().bottom - topo)))]
        .filter((y) => y > 0 && y < alturaCss).sort((a, b) => a - b);
      const tela = await toCanvas(copia, { pixelRatio: 2, backgroundColor: "#ffffff", width: LARGURA_PX, height: alturaCss });
      const escala = tela.width / LARGURA_PX; // px do canvas por px de CSS
      const pxPorMm = tela.width / largura;
      const alturaPx = Math.floor(alturaPagina * pxPorMm);
      let y = 0;
      while (y < tela.height - 2) {
        let fim = Math.min(tela.height, y + alturaPx);
        if (fim < tela.height) {
          // Último fim de bloco que cabe na página (sem deixar a página com menos de metade usada).
          const corte = fins.map((f) => Math.round(f * escala)).filter((f) => f > y + alturaPx * 0.5 && f <= fim).pop();
          if (corte) fim = corte + 2;
        }
        const pedaco = document.createElement("canvas");
        pedaco.width = tela.width;
        pedaco.height = fim - y;
        const ctx = pedaco.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, pedaco.width, pedaco.height);
        ctx.drawImage(tela, 0, y, tela.width, pedaco.height, 0, 0, tela.width, pedaco.height);
        if (!primeira) doc.addPage();
        primeira = false;
        doc.addImage(pedaco.toDataURL("image/jpeg", 0.92), "JPEG", margem, margem, largura, pedaco.height / pxPorMm);
        y = fim;
      }
    } finally {
      palco.remove();
    }
  }
  return doc.output("blob");
}
