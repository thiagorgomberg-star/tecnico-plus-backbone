/**
 * Backup semanal do Técnico Plus no Google Drive (Google Apps Script, roda na conta Google do supervisor).
 * Instalação: script.google.com > Novo projeto > colar este código > escolher "configurar" > Executar > Permitir.
 * Toda segunda às 6h ele grava a semana anterior em "Backup Técnico Plus/<semana>":
 *   banco-completo.zip, "O.S. atendidas/OS-<n> .../" (fotos, relatório PDF, KMZ das caixas, dados.json),
 *   "Arquivos da semana/" (despesas, inventário, curvas, documentos) e resumo.csv.
 * Para refazer uma semana: rode backupDaSemana('2026-10-20') (qualquer data da semana) pelo editor.
 * A chave abaixo só permite ler os dados para o backup (função backup-drive do Supabase).
 */
const URL_BACKUP = 'https://wnuivnpywflczknxpytx.supabase.co/functions/v1/backup-drive';
const CHAVE = '__CHAVE__';
const PASTA_RAIZ = 'Backup Técnico Plus';
const ESTADO = 'estado-do-backup.json';
const LIMITE_MS = 4.5 * 60 * 1000; // o Google encerra cada execução em 6 min: continua sozinho na seguinte
const FOTOS_NO_PDF = 16;

function configurar() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backupSemanal').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  backupSemanal();
}

function backupSemanal() {
  backupDaSemana('');
}

function backupDaSemana(data) {
  const m = chamar({ acao: 'manifesto', semana: data || undefined });
  const etapas = [];
  m.tabelas.forEach((t) => etapas.push({ t: 'tabela', nome: t }));
  etapas.push({ t: 'zip' });
  m.ordens.forEach((o) => etapas.push({ t: 'os', id: o.id }));
  for (let i = 0; i < m.arquivos.length; i += 20) etapas.push({ t: 'arquivos', itens: m.arquivos.slice(i, i + 20) });
  etapas.push({ t: 'fim' });
  salvarEstado({ nome: m.nome, semana: data || '', resumoCsv: m.resumoCsv, etapas: etapas });
  PropertiesService.getScriptProperties().setProperty('etapa', '0');
  continuar();
}

function continuar() {
  const inicio = Date.now();
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'continuar').forEach((t) => ScriptApp.deleteTrigger(t));
  const est = lerEstado();
  if (!est) return;
  const props = PropertiesService.getScriptProperties();
  const semana = subpasta(raiz(), est.nome);
  for (let i = Number(props.getProperty('etapa') || 0); i < est.etapas.length; i++) {
    if (Date.now() - inicio > LIMITE_MS) {
      ScriptApp.newTrigger('continuar').timeBased().after(60 * 1000).create();
      return;
    }
    executar(est.etapas[i], semana, est);
    props.setProperty('etapa', String(i + 1));
  }
  apagarEstado();
  console.log('Backup concluído: ' + PASTA_RAIZ + '/' + est.nome);
}

function executar(e, semana, est) {
  if (e.t === 'tabela') {
    const linhas = [];
    for (let p = 0; ; p++) {
      const r = chamar({ acao: 'tabela', tabela: e.nome, pagina: p, semana: est.semana || undefined });
      Array.prototype.push.apply(linhas, r.linhas);
      if (r.acabou) break;
    }
    gravar(subpasta(semana, '_banco'), Utilities.newBlob(JSON.stringify(linhas), 'application/json', e.nome + '.json'), true);
  } else if (e.t === 'zip') {
    const pasta = subpasta(semana, '_banco');
    const blobs = [];
    const it = pasta.getFiles();
    while (it.hasNext()) blobs.push(it.next().getBlob());
    gravar(semana, Utilities.zip(blobs, 'banco-completo.zip'), true);
    pasta.setTrashed(true);
  } else if (e.t === 'os') {
    const r = chamar({ acao: 'os', id: e.id });
    const pasta = subpasta(subpasta(semana, 'O.S. atendidas'), r.pasta);
    gravar(pasta, Utilities.newBlob(JSON.stringify(r.dados, null, 2), 'application/json', 'dados.json'), true);
    const noPdf = [];
    if (r.fotos.length) {
      const fotos = subpasta(pasta, 'fotos');
      for (let i = 0; i < r.fotos.length; i += 8) {
        const lote = r.fotos.slice(i, i + 8);
        const respostas = UrlFetchApp.fetchAll(lote.map((f) => ({ url: f.url, muteHttpExceptions: true })));
        respostas.forEach((resp, j) => {
          if (resp.getResponseCode() !== 200) return;
          const blob = resp.getBlob().setName(lote[j].nome);
          gravar(fotos, blob, false);
          if (lote[j].imagem && noPdf.length < FOTOS_NO_PDF) {
            noPdf.push('<div class="foto"><img src="data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes())
              + '"><div>' + lote[j].legenda + '</div></div>');
          }
        });
      }
    }
    const nomePdf = 'Relatorio OS-' + r.numero + '.pdf';
    const pdf = (fotosHtml) => Utilities.newBlob(r.html.replace('{{FOTOS}}', fotosHtml), 'text/html', 'r.html').getAs('application/pdf').setName(nomePdf);
    try {
      gravar(pasta, pdf(noPdf.join('')), true);
    } catch (erro) { // relatório pesado demais com as fotos: sai sem elas (estão na pasta "fotos")
      gravar(pasta, pdf('<p>Fotos na pasta "fotos".</p>'), true);
    }
    if (r.kmz) gravar(pasta, Utilities.newBlob(Utilities.base64Decode(r.kmz), 'application/vnd.google-earth.kmz', 'Caixas OS-' + r.numero + '.kmz'), true);
  } else if (e.t === 'arquivos') {
    const links = chamar({ acao: 'links', itens: e.itens });
    e.itens.forEach((a, j) => {
      if (!links[j]) return;
      const resp = UrlFetchApp.fetch(links[j], { muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) return;
      let pasta = semana;
      a.destino.slice(0, -1).forEach((p) => { pasta = subpasta(pasta, p); });
      gravar(pasta, resp.getBlob().setName(a.destino[a.destino.length - 1]), false);
    });
  } else if (e.t === 'fim') {
    gravar(semana, Utilities.newBlob(est.resumoCsv, 'text/csv', 'resumo.csv'), true);
  }
}

function chamar(corpo) {
  corpo.chave = CHAVE;
  for (let tentativa = 1; ; tentativa++) {
    const resp = UrlFetchApp.fetch(URL_BACKUP, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(corpo), muteHttpExceptions: true,
    });
    if (resp.getResponseCode() === 200) return JSON.parse(resp.getContentText());
    if (tentativa >= 3) throw new Error('backup-drive ' + resp.getResponseCode() + ': ' + resp.getContentText());
    Utilities.sleep(5000 * tentativa);
  }
}

function raiz() {
  return subpasta(DriveApp.getRootFolder(), PASTA_RAIZ);
}

function subpasta(pai, nome) {
  const it = pai.getFoldersByName(nome);
  return it.hasNext() ? it.next() : pai.createFolder(nome);
}

// substituir: troca o arquivo de mesmo nome; senão mantém o que já existe (refazer a semana não duplica).
function gravar(pasta, blob, substituir) {
  const it = pasta.getFilesByName(blob.getName());
  if (it.hasNext()) {
    if (!substituir) return;
    while (it.hasNext()) it.next().setTrashed(true);
  }
  pasta.createFile(blob);
}

function lerEstado() {
  const it = raiz().getFilesByName(ESTADO);
  return it.hasNext() ? JSON.parse(it.next().getBlob().getDataAsString()) : null;
}

function salvarEstado(est) {
  gravar(raiz(), Utilities.newBlob(JSON.stringify(est), 'application/json', ESTADO), true);
}

function apagarEstado() {
  const it = raiz().getFilesByName(ESTADO);
  while (it.hasNext()) it.next().setTrashed(true);
}
