"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Anexo = { id: string; caminho_arquivo: string; nome_arquivo: string | null; descricao: string | null; criado_em: string };

// O navegador às vezes não informa o tipo de KMZ/KML; o Storage precisa dele.
function tipoDoArquivo(arquivo: File) {
  const ext = arquivo.name.split(".").pop()?.toLowerCase();
  if (ext === "kmz") return "application/vnd.google-earth.kmz";
  if (ext === "kml") return "application/vnd.google-earth.kml+xml";
  return arquivo.type || "application/octet-stream";
}

// Envia arquivos de apoio para a pasta da O.S. (os-anexos/<id>/apoio/...).
export async function enviarMaterialApoio(osId: string, arquivos: File[], descricao = "") {
  for (const arquivo of arquivos) {
    const nomeSeguro = arquivo.name.normalize("NFD").replace(/[^\w.-]+/g, "_");
    const caminho = `${osId}/apoio/${crypto.randomUUID()}-${nomeSeguro}`;
    const { error: erroUpload } = await supabase.storage.from("os-anexos")
      .upload(caminho, arquivo, { contentType: tipoDoArquivo(arquivo) });
    if (erroUpload) throw new Error(`${arquivo.name}: ${erroUpload.message}`);
    const { error } = await supabase.from("os_anexos").insert({
      os_id: osId, tipo: "documento", caminho_arquivo: caminho, nome_arquivo: arquivo.name, descricao: descricao || null,
    });
    if (error) throw new Error(`${arquivo.name}: ${error.message}`);
  }
}

export default function MaterialApoio({ osId, numero, fechar }: { osId: string; numero: number; fechar: () => void }) {
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    supabase.from("os_anexos").select("id, caminho_arquivo, nome_arquivo, descricao, criado_em")
      .eq("os_id", osId).eq("tipo", "documento").order("criado_em")
      .then(({ data }) => setAnexos(data ?? []));
  }, [osId, versao]);

  async function enviar() {
    setEnviando(true);
    try {
      await enviarMaterialApoio(osId, arquivos, descricao);
      setArquivos([]);
      setDescricao("");
    } catch (e) {
      alert((e as Error).message);
    }
    setEnviando(false);
    recarregar();
  }

  async function abrir(a: Anexo) {
    const { data, error } = await supabase.storage.from("os-anexos").createSignedUrl(a.caminho_arquivo, 600);
    if (error) return alert(error.message);
    window.open(data.signedUrl, "_blank");
  }

  async function remover(a: Anexo) {
    if (!confirm(`Remover ${a.nome_arquivo ?? "arquivo"}?`)) return;
    await supabase.storage.from("os-anexos").remove([a.caminho_arquivo]);
    const { error } = await supabase.from("os_anexos").delete().eq("id", a.id);
    if (error) alert(error.message);
    recarregar();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={fechar}>
      <div className="w-full max-w-lg rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Material de apoio · O.S. #{numero}</h2>
        <p className="mt-1 text-sm text-gray-500">Fotos, prints, PDF, KMZ ou planilhas que o técnico consulta no app.</p>

        <ul className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200">
          {anexos.length === 0 && <li className="p-3 text-sm text-gray-500">Nenhum arquivo ainda.</li>}
          {anexos.map((a) => (
            <li key={a.id} className="flex items-center gap-2 p-3 text-sm">
              <button className="truncate text-left text-blue-700 hover:underline" onClick={() => abrir(a)}>
                {a.nome_arquivo ?? a.caminho_arquivo.split("/").pop()}
              </button>
              {a.descricao && <span className="truncate text-gray-500">· {a.descricao}</span>}
              <button className="ml-auto text-red-700 hover:underline" onClick={() => remover(a)}>Remover</button>
            </li>
          ))}
        </ul>

        <div className="mt-4 grid gap-2">
          <input type="file" multiple onChange={(e) => setArquivos(Array.from(e.target.files ?? []))}
            accept="image/*,.pdf,.kmz,.kml,.xlsx,.docx,.zip,.txt" className="text-sm" />
          <input className="rounded-lg border border-gray-300 p-2 text-sm" placeholder="Descrição (opcional)"
            value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-lg px-4 py-2 text-gray-600 hover:bg-gray-100" onClick={fechar}>Fechar</button>
          <button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-40"
            disabled={arquivos.length === 0 || enviando} onClick={enviar}>
            {enviando ? "Enviando..." : `Anexar ${arquivos.length || ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
