"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

// Exclusão com dupla confirmação: 1) mostra o que vai junto; 2) pede para digitar EXCLUIR.
type Props = {
  tipo: "os" | "tecnico";
  id: string;
  nome: string; // "O.S. #12" ou o nome do técnico
  fechar: () => void;
  aoExcluir: () => void;
};

type Resumo = { fotos?: number; caixas?: number; vinculos?: Record<string, number>; temHistorico?: boolean };

async function chamar(corpo: object) {
  const { data, error } = await supabase.functions.invoke("excluir-dados", { body: corpo });
  if (error) {
    const detalhe = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detalhe?.erro ?? error.message);
  }
  if (data?.erro) throw new Error(data.erro);
  return data;
}

export default function ExcluirDados({ tipo, id, nome, fechar, aoExcluir }: Props) {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    chamar({ acao: "resumo", tipo, id }).then(setResumo).catch((e) => setErro(e.message));
  }, [tipo, id]);

  async function excluir() {
    setExcluindo(true);
    setErro("");
    try {
      await chamar({ acao: "excluir", tipo, id });
      aoExcluir();
      fechar();
    } catch (e) {
      setErro((e as Error).message);
      setExcluindo(false);
    }
  }

  const historico = resumo?.vinculos ? Object.entries(resumo.vinculos) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={fechar}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 text-lg font-semibold text-red-700">Excluir {nome}</h2>
        {!resumo && !erro && <p className="text-sm text-gray-500">Verificando o que está ligado a {tipo === "os" ? "esta O.S." : "este técnico"}...</p>}

        {resumo && etapa === 1 && (
          <div className="space-y-2 text-sm text-gray-700">
            {tipo === "os" ? (
              <>
                <p>A O.S. será apagada de vez, junto com:</p>
                <ul className="list-disc pl-5">
                  <li>{resumo.fotos ?? 0} foto(s) e anexos</li>
                  <li>{resumo.caixas ?? 0} caixa(s) de emenda/DGO cadastradas nela, com fibras e fotos</li>
                  <li>histórico, alertas, serviços lançados e relatórios compartilhados</li>
                </ul>
                <p>Despesas e movimentos de estoque ligados a ela ficam, sem a O.S.</p>
              </>
            ) : resumo.temHistorico ? (
              <>
                <p>Este técnico tem histórico que não pode ser apagado sem perder dados da rede e das O.S.:</p>
                <ul className="list-disc pl-5">
                  {historico.map(([k, n]) => <li key={k}>{n} {k}</li>)}
                </ul>
                <p>Ele vai <b>perder o acesso ao app</b> e sumir das listas. O histórico continua com o nome dele, e o e-mail fica livre para outro cadastro.</p>
              </>
            ) : (
              <p>O técnico não tem O.S. nem outros registros. O login, expedientes, trajeto e escala dele serão apagados de vez.</p>
            )}
            <p className="font-semibold text-red-700">Não dá para desfazer.</p>
          </div>
        )}

        {resumo && etapa === 2 && (
          <label className="block text-sm text-gray-700">
            Para confirmar, digite <b>EXCLUIR</b>:
            <input autoFocus className="mt-1 w-full rounded-lg border border-gray-300 p-2" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </label>
        )}

        {erro && <p className="mt-2 text-sm text-red-700">{erro}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50" onClick={fechar}>Voltar</button>
          {resumo && etapa === 1 && (
            <button className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800" onClick={() => setEtapa(2)}>Continuar</button>
          )}
          {resumo && etapa === 2 && (
            <button className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-40"
              disabled={texto.trim().toUpperCase() !== "EXCLUIR" || excluindo} onClick={excluir}>
              {excluindo ? "Excluindo..." : tipo === "tecnico" && resumo.temHistorico ? "Remover acesso" : "Excluir de vez"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
