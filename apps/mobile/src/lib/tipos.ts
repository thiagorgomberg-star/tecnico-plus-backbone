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
};

export type Expediente = {
  id: string;
  inicio: string;
  fim: string | null;
  km_inicial: number | null;
};

export const rotuloStatus: Record<StatusOS, string> = {
  rascunho: 'Rascunho',
  enviada: 'Nova',
  aceita: 'Aceita',
  em_execucao: 'Em execução',
  pausada: 'Pausada (refeição)',
  concluida: 'Concluída',
  devolvida: 'Devolvida',
  baixada: 'Baixada',
  cancelada: 'Cancelada',
};

// Próxima ação do técnico para cada status.
export const proximaAcao: Partial<Record<StatusOS, { status: StatusOS; rotulo: string }>> = {
  enviada: { status: 'aceita', rotulo: 'Aceitar O.S.' },
  aceita: { status: 'em_execucao', rotulo: 'Iniciar atendimento' },
  devolvida: { status: 'em_execucao', rotulo: 'Retomar atendimento' },
  em_execucao: { status: 'concluida', rotulo: 'Concluir O.S.' },
};
