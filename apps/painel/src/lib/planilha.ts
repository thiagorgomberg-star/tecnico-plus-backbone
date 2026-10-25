import JSZip from "jszip";

// Gera um .xlsx simples (uma aba, cabeçalho em negrito, filtro e primeira linha congelada) e baixa no navegador.
// Célula: texto, número, data (Date), link ({ texto, url }) ou vazio. `decimais` marca as colunas sempre com 2 casas (R$).
export type Celula = string | number | Date | { texto: string; url: string } | null | undefined;

const esc = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const coluna = (i: number) => {
  let s = "";
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

// Data do Excel: dias desde 30/12/1899, no fuso local.
const serialExcel = (d: Date) => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000;

export type AbaXlsx = { nome: string; cabecalho: string[]; linhas: Celula[][]; decimais?: boolean[] };

// Uma aba só (uso geral do painel).
export async function baixarXlsx(arquivo: string, aba: string, cabecalho: string[], linhas: Celula[][], decimais?: boolean[]) {
  return baixarXlsxAbas(arquivo, [{ nome: aba, cabecalho, linhas, decimais }]);
}

function abaXml({ cabecalho, linhas, decimais }: AbaXlsx) {
  const celula = (v: Celula, ref: string, estilo = 0, col = 0) => {
    if (v == null || v === "") return "";
    if (typeof v === "number") {
      if (!Number.isFinite(v)) return "";
      const s = estilo || (decimais?.[col] || !Number.isInteger(v) ? 4 : 0);
      return `<c r="${ref}"${s ? ` s="${s}"` : ""}><v>${v}</v></c>`;
    }
    if (v instanceof Date) return `<c r="${ref}" s="2"><v>${serialExcel(v)}</v></c>`;
    if (typeof v === "object") {
      const f = `HYPERLINK("${v.url.replace(/"/g, '""')}","${v.texto.replace(/"/g, '""')}")`;
      return `<c r="${ref}" t="str" s="3"><f>${esc(f)}</f><v>${esc(v.texto)}</v></c>`;
    }
    return `<c r="${ref}" t="inlineStr"${estilo ? ` s="${estilo}"` : ""}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  };
  const linhaXml = (valores: Celula[], n: number, estilo = 0) =>
    `<row r="${n}">${valores.map((v, i) => celula(v, `${coluna(i)}${n}`, estilo, i)).join("")}</row>`;

  const ultima = `${coluna(cabecalho.length - 1)}${linhas.length + 1}`;
  const cols = cabecalho.map((c, i) => {
    const w = Math.min(50, Math.max(10, c.length + 2,
      ...linhas.slice(0, 200).map((l) => { const v = l[i]; return typeof v === "object" && v && !(v instanceof Date) ? v.texto.length : String(v ?? "").length; })));
    return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>${linhaXml(cabecalho, 1, 1)}${linhas.map((l, i) => linhaXml(l, i + 2)).join("")}</sheetData>
<autoFilter ref="A1:${ultima}"/>
</worksheet>`;
}

// Várias abas no mesmo arquivo (ex.: relatório de produção para o gerente).
export async function baixarXlsxAbas(arquivo: string, abas: AbaXlsx[]) {
  const nomes = abas.map((a, i) => esc((a.nome.replace(/[\\/?*[\]:]/g, " ").slice(0, 31)) || `Aba ${i + 1}`));
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${nomes.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
<definedNames>${abas.map((a, i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${nomes[i]}'!$A$1:$${coluna(a.cabecalho.length - 1)}$${a.linhas.length + 1}</definedName>`).join("")}</definedNames>
</workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  // Estilos: 0 normal, 1 cabeçalho, 2 data, 3 link, 4 número com 2 casas
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF312D2A"/></patternFill></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="5"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf fontId="2" applyFont="1"/><xf numFmtId="4" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`);
  abas.forEach((a, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, abaXml(a)));

  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo.endsWith(".xlsx") ? arquivo : `${arquivo}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
