export type StatusOS =
  | 'rascunho'
  | 'enviada'
  | 'aceita'
  | 'em_execucao'
  | 'pausada'
  | 'concluida'
  | 'devolvida'
  | 'baixada'
  | 'cancelada';

export type OrdemServico = {
  id: string;
  numero: number;
  tipo: string;
  prioridade: 'baixa' | 'media' | 'alta' | 'emergencia';
  status: StatusOS;
  titulo: string;
  descricao: string | null;
  endereco: string | null;
  prazo: string | null;
  observacao_tecnico: string | null;
  observacao_supervisor: string | null;
  evento_localizado_em: string | null;
  ticket_acionamento: string | null;
  sla_limite: string | null;
  tecnico_id?: string | null;
  pausa_solicitada_em?: string | null;
  pausa_motivo?: string | null;
  enviada_em?: string | null;
  reaberta_em?: string | null; // reaberta pelo supervisor depois de encerrada
  reaberta_motivo?: string | null;
  continua_em?: string | null; // pausada para continuar em outro dia (roteamento)
  informado_por?: string | null; // ocorrência informada por um técnico (fotos dele viram referência)
  criado_em?: string;
  origem_ponto_id?: string | null; // gerada a partir de um ponto da vistoria (tem fotos de referência)
  // Clientes atendidos no evento, cada um com o próprio ticket e texto de acionamento (o SLA da O.S. é o menor deles).
  os_clientes?: { ticket: string | null; texto_acionamento: string | null; restabelecido_em?: string | null; cliente: { nome: string; sla_horas: number } | null }[];
};

export type Expediente = {
  id: string;
  inicio: string;
  fim: string | null;
  km_inicial: number | null;
};

// Atividades que costumam levar vários dias: podem ser pausadas para continuar no dia seguinte.
export const variosDias = (tipo: string) => /roteamento/i.test(tipo);

export const rotuloDaOs = (os: Pick<OrdemServico, 'status' | 'continua_em'>) =>
  os.status === 'pausada' && os.continua_em
    ? `Continua em ${os.continua_em.split('-').reverse().slice(0, 2).join('/')}` : rotuloStatus[os.status];

export const rotuloStatus: Record<StatusOS, string> = {
  rascunho: 'Rascunho',
  enviada: 'Nova',
  aceita: 'Visualizada',
  em_execucao: 'Em execução',
  pausada: 'Pausada (refeição)',
  concluida: 'Concluída',
  devolvida: 'Devolvida',
  baixada: 'Baixada',
  cancelada: 'Cancelada',
};

// Próxima ação do técnico para cada status.
export const proximaAcao: Partial<Record<StatusOS, { status: StatusOS; rotulo: string }>> = {
  enviada: { status: 'em_execucao', rotulo: 'Iniciar O.S.' }, // marca visualizada e inicia num toque só
  aceita: { status: 'em_execucao', rotulo: 'Iniciar atendimento' },
  devolvida: { status: 'em_execucao', rotulo: 'Retomar atendimento' },
  em_execucao: { status: 'concluida', rotulo: 'Concluir O.S.' },
};
