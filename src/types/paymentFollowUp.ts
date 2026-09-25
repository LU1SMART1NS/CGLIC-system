/**
 * Tipos Canônicos para o Workflow de Acompanhamento de Pagamentos / Faturamento (SaldoARP 3.0 - Fase 7.4-C)
 * Conforme especificado na FASE 7.4-B.
 */

import type { TaskExecutionMode, ContractTaskTemplate } from './index';

/**
 * Estados do ciclo de acompanhamento de pagamento / faturamento
 */
export type PaymentWorkflowStatus =
  | 'RECEBIDO'               // Atesto assinado no SEI registrado no sistema
  | 'ATRIBUIDO'              // Servidor de confecção designado para instrução
  | 'EM_INSTRUCAO'           // Análise de regularidade fiscal, saldo de empenho e conformidade
  | 'PENDENTE_DOCUMENTACAO'  // Suspensão por pendência documental do credor (ex: CND vencida)
  | 'DESPACHO_ELABORADO'     // Minuta do despacho de pagamento assinada no SEI
  | 'ENVIADO_CGOFI'          // Processo remetido formalmente à CGOFI
  | 'AGUARDANDO_CGOFI'       // Em processamento no setor financeiro (contagem de SLA/dias sem resposta)
  | 'DEVOLVIDO_FISCAL'       // Devolvido pela CGOFI para complementação
  | 'PAGAMENTO_CONFIRMADO'   // Ordem Bancária emitida no SIAFI / Contratos.gov
  | 'CONCLUIDO'              // Ciclo finalizado com evidência arquivada
  | 'CANCELADO';             // Cancelado por anulação do atesto ou rescisão

/**
 * Nível de atenção/urgência do ciclo para a Central de Atenção
 */
export type PaymentAlertNivel = 'CRITICO' | 'ATENCAO' | 'ACOMPANHAMENTO' | 'NORMAL';

/**
 * Alerta operacional emitido pelo motor de prazos de pagamentos
 */
export interface PaymentAlert {
  id: string;
  cycleKey: string;
  contractKey: string;
  nivel: PaymentAlertNivel;
  tipo:
    | 'PAGAMENTO_VENCIMENTO_IMINENTE'
    | 'PAGAMENTO_FATURA_VENCIDA'
    | 'ATESTO_PENDENTE_ATRIBUICAO'
    | 'CGOFI_SEM_RESPOSTA'
    | 'EMPENHO_SEM_SALDO_SUFICIENTE'
    | 'INFO';
  mensagem: string;
  diasRelevantes?: number;
  dataReferencia?: string;
}

/**
 * Dados de entrada para abertura ou atualização de um ciclo de pagamento
 */
export interface PaymentCycleInput {
  contractKey: string;
  competencia: string;                  // Formato YYYY-MM (ex: '2026-03')
  dataAssinaturaAtesto: string;         // Data no formato YYYY-MM-DD
  dataVencimentoFatura: string;         // Data no formato YYYY-MM-DD
  documentoAtestoSei: string;           // Identificador ou número do Doc SEI (ex: 'Doc 143589236')
  numeroProcessoPagamentoSei?: string;  // Processo SEI específico de pagamento (ex: '08200.001234/2026-56')
  numeroProcessoContratoSei?: string;   // Processo SEI principal do contrato
  numeroNotasFiscais?: number;          // Quantidade de NFs abrangidas
  valorAtesto: number;                  // Valor do atesto / faturamento em R$
  empenhoCanonicalKey?: string;         // Chave canônica do empenho de lastro ({uasg}-{ano}-{numeroNormalizado})
  titularNome?: string;                 // Fiscal Titular / Gestor supervisor
  responsavelNome?: string;             // Servidor de confecção atribuído
  documentoDespachoSei?: string;        // Número do documento SEI de despacho
  dataEnvioCgofi?: string;              // Data de envio à CGOFI (YYYY-MM-DD)
  numeroOrdemBancaria?: string;         // Número da Ordem Bancária SIAFI (ex: '2026OB800123')
  dataOrdemBancaria?: string;           // Data da emissão da OB (YYYY-MM-DD)
  observacoes?: string;
}

/**
 * Indicadores temporais e de prazos calculados para o ciclo
 */
export interface PaymentCyclePrazos {
  diasUteisAteVencimento: number;       // Dias úteis de hoje até a data de vencimento da fatura
  janelaTotalDiasUteis: number;         // Dias úteis da data de recebimento do atesto até o vencimento
  diasSemRespostaCgofi: number;         // Dias úteis desde o envio à CGOFI até hoje (ou até a data da OB)
  margemEnvioDiasUteis: number;         // Dias úteis da data de envio até a data de vencimento
  isVencida: boolean;
  statusPrazo: 'NORMAL' | 'ATENCAO' | 'CRITICO' | 'VENCIDO';
}

/**
 * Representação completa do Ciclo Operacional de Faturamento / Atesto
 */
export interface PaymentFollowUpCycle {
  cycleKey: string;                     // Identidade canônica: {contractKey}-PGTO-{YYYYMM}-{DocIdNormalizado}
  contractKey: string;
  competencia: string;
  status: PaymentWorkflowStatus;
  input: PaymentCycleInput;
  prazos: PaymentCyclePrazos;
  alerts: PaymentAlert[];
  tasks?: ContractTaskTemplate;
  criadoEm: string;
  atualizadoEm: string;
  concluidoEm?: string;
  concluidoPor?: string;
}

/**
 * Definição de uma tarefa do template de acompanhamento de pagamento
 */
export interface PaymentFollowUpTaskDef {
  ordem: number;
  macrotarefaNome: string;
  nome: string;
  executionMode: TaskExecutionMode;
  sistemaDestino?: string;
  externalLinkUrl?: string;
  prazoSugeridoDiasUteis?: number;
  condicao?: (input: PaymentCycleInput) => boolean;
}
