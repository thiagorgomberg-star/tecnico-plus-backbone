// Gera um PDF A4 deitado a partir de pedaços da tela (imagem fiel ao que o supervisor vê), quebrando em páginas.
// Com mais de um elemento (ex.: análise e parecer), cada um começa numa página nova.
export async function pdfDoElemento(els: HTMLElement | HTMLElement[]): Promise<Blob> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margem = 8;
  const largura = doc.internal.pageSize.getWidth() - 2 * margem;
  const alturaPagina = doc.internal.pageSize.getHeight() - 2 * margem;
  let primeira = true;
  for (const el of Array.isArray(els) ? els : [els]) {
    const tela = await toCanvas(el, { pixelRatio: 2, backgroundColor: "#ffffff" });
    const pxPorMm = tela.width / largura;
    const alturaPx = Math.floor(alturaPagina * pxPorMm);
    for (let y = 0; y < tela.height; y += alturaPx) {
      const pedaco = document.createElement("canvas");
      pedaco.width = tela.width;
      pedaco.height = Math.min(alturaPx, tela.height - y);
      pedaco.getContext("2d")!.drawImage(tela, 0, y, tela.width, pedaco.height, 0, 0, tela.width, pedaco.height);
      if (!primeira) doc.addPage();
      primeira = false;
      doc.addImage(pedaco.toDataURL("image/jpeg", 0.92), "JPEG", margem, margem, largura, pedaco.height / pxPorMm);
    }
  }
  return doc.output("blob");
}
