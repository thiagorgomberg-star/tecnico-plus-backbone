export type StatusOS =
  | "rascunho"
  | "enviada"
  | "aceita"
  | "em_execucao"
  | "pausada"
  | "concluida"
  | "devolvida"
  | "baixada"
  | "cancelada";

export type Prioridade = "baixa" | "media" | "alta" | "emergencia";

export type OrdemServico = {
  id: string;
  numero: number;
  tipo: string;
  prioridade: Prioridade;
  status: StatusOS;
  titulo: string;
  ticket_acionamento: string | null;
  ticket_interno: boolean;
  criada_por: string;
  sla_limite: string | null;
  descricao: string | null;
  endereco: string | null;
  tecnico_id: string | null;
  prazo: string | null;
  enviada_em: string | null;
  concluida_em: string | null;
  baixada_em: string | null;
  observacao_tecnico: string | null;
  observacao_supervisor: string | null;
  pausa_solicitada_em: string | null;
  continua_em?: string | null; // pausada para continuar em outro dia (roteamento)
  pausa_motivo: string | null;
  criado_em: string;
  tecnico?: { nome: string } | null;
};

export type Tecnico = { id: string; nome: string };

export const rotuloDaOs = (os: { status: StatusOS; continua_em?: string | null }) =>
  os.status === "pausada" && os.continua_em
    ? `Continua em ${os.continua_em.split("-").reverse().slice(0, 2).join("/")}` : rotuloStatus[os.status];

export const rotuloStatus: Record<StatusOS, string> = {
  rascunho: "Backlog",
  enviada: "Enviada",
  aceita: "Visualizada",
  em_execucao: "Em execução",
  pausada: "Pausada (refeição)",
  concluida: "Aguardando baixa",
  devolvida: "Devolvida",
  baixada: "Baixada",
  cancelada: "Cancelada",
};

export const corStatus: Record<StatusOS, string> = {
  rascunho: "bg-gray-100 text-gray-700",
  enviada: "bg-blue-100 text-blue-800",
  aceita: "bg-indigo-100 text-indigo-800",
  em_execucao: "bg-amber-100 text-amber-800",
  pausada: "bg-orange-100 text-orange-800",
  concluida: "bg-purple-100 text-purple-800",
  devolvida: "bg-red-100 text-red-800",
  baixada: "bg-green-100 text-green-800",
  cancelada: "bg-gray-100 text-gray-500",
};

export const TIPOS_OS = ["Corretiva", "Preventiva rede", "Preventiva site", "Roteamento de fibras", "Vistoria de rota", "Vistoria Backbone MG", "Vistoria Backbone SP", "Ocorrência informada"];
