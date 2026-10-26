// Gera um PDF A4 deitado a partir de um pedaço da tela (imagem fiel ao que o supervisor vê), quebrando em páginas.
export async function pdfDoElemento(el: HTMLElement): Promise<Blob> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const tela = await toCanvas(el, { pixelRatio: 2, backgroundColor: "#ffffff" });
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margem = 8;
  const largura = doc.internal.pageSize.getWidth() - 2 * margem;
  const alturaPagina = doc.internal.pageSize.getHeight() - 2 * margem;
  const pxPorMm = tela.width / largura;
  const alturaPx = Math.floor(alturaPagina * pxPorMm);
  for (let y = 0, pagina = 0; y < tela.height; y += alturaPx, pagina++) {
    const pedaco = document.createElement("canvas");
    pedaco.width = tela.width;
    pedaco.height = Math.min(alturaPx, tela.height - y);
    pedaco.getContext("2d")!.drawImage(tela, 0, y, tela.width, pedaco.height, 0, 0, tela.width, pedaco.height);
    if (pagina) doc.addPage();
    doc.addImage(pedaco.toDataURL("image/jpeg", 0.92), "JPEG", margem, margem, largura, pedaco.height / pxPorMm);
  }
  return doc.output("blob");
}
