/**
 * Tipos Canônicos para o Workflow de Acompanhamento de Pagamentos / Faturamento (CGLIC 3.0 - Fase 7.4-C)
 * Conforme especificado na FASE 7.4-B.
 */

import type { TaskExecutionMode } from './index';

/**
 * Situação do ciclo, deduzida do último marco registrado (ninguém a escolhe à mão):
 * Recebido -> Conferido -> Enviado à CGOFI -> Pago.
 */
export type PaymentWorkflowStatus =
  | 'RECEBIDO'        // Documentos recebidos, em conferência pela CGLIC
  | 'COM_PENDENCIA'   // Conferência suspensa por pendência (do fornecedor ou do fiscal)
  | 'CONFERIDO'       // Conferência concluída, pronto para enviar à CGOFI
  | 'ENVIADO_CGOFI'   // Processo na CGOFI; a CGLIC só acompanha
  | 'DEVOLVIDO'       // Devolvido pela CGOFI; volta à conferência
  | 'LIQUIDADO'       // Liquidado no SIAFI (lido da fatura pela conciliação); aguarda a OB
  | 'PAGO'            // Ordem Bancária emitida
  | 'CANCELADO';      // Cancelado por anulação do atesto ou rescisão

/** Etapa em curso e quem responde pelo prazo dela. */
export type PaymentEtapa = 'CONFERENCIA' | 'ENVIO' | 'COBRANCA_CGOFI';

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
    | 'PRAZO_ETAPA_VENCIDO'
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
  competencia: string;                  // YYYY-MM, derivada da data de recebimento; compõe a chave do ciclo e não aparece na tela
  dataRecebimento: string;              // Quando a CGLIC recebeu os documentos (YYYY-MM-DD): início da contagem
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
  /** Identidade canônica do responsável (Fase 10-A.2), ponte opcional para auth.users. */
  responsavelUserId?: string;
  dataConferencia?: string;             // Quando a conferência foi concluída (YYYY-MM-DD)
  prazoConferenciaAte?: string;         // Data-alvo vigente da conferência (CGLIC)
  prazoEnvioAte?: string;               // Data-alvo vigente do envio à CGOFI (CGLIC)
  cobrarCgofiAte?: string;              // A partir daqui a CGLIC cobra a CGOFI
  documentoDespachoSei?: string;        // Número do documento SEI de despacho
  dataEnvioCgofi?: string;              // Data de envio à CGOFI (YYYY-MM-DD)
  numeroOrdemBancaria?: string;         // Número da Ordem Bancária SIAFI (ex: '2026OB800123')
  dataOrdemBancaria?: string;           // Data da emissão da OB (YYYY-MM-DD)
  observacoes?: string;
  dataLiquidacao?: string;              // Liquidação no SIAFI (da fatura, pela conciliação)
  numeroNp?: string;                    // Nota(s) de pagamento das faturas do ciclo
  cologEnviadoEm?: string;              // Envio à COLOG (bens a incorporar)
  cologSei?: string;
  liquidacaoProrrogada?: boolean;       // Prazo de liquidação prorrogado (IN 77 art. 7º § 3º)
}

/** Item "DO PAGAMENTO" (Portaria 50, Anexo II). */
export interface PaymentCycleItem {
  id: string;
  notaFiscal: string;
  notaFiscalSei?: string;
  atestoSei: string;
  empenhoCanonicalKey: string;
  subelemento?: string;
  valorBruto: number;
  jurosMulta: number;
  glosa: number;
  desconto: number;
  valorAPagar: number;
  justificativaJuros?: string;
}

export type ChecklistResposta = 'SIM' | 'NAO' | 'NA';

export interface PaymentChecklistAnswer {
  item: string;
  resposta: ChecklistResposta;
  sei?: string;
  conferidoEm?: string;
  conferidoPorNome?: string;
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

/** Documento recebido no ciclo (atesto, nota fiscal, fatura...), com o número no SEI. */
export interface PaymentCycleDocument {
  id: string;
  tipo: string;
  numero?: string;
  sei: string;
  valor?: number;
  dataRecebimento?: string;
}

export type PaymentCycleEventTipo =
  | 'RECEBIDO' | 'CONFERIDO' | 'PENDENCIA' | 'RETORNO' | 'ENVIADO_CGOFI' | 'DEVOLVIDO' | 'LIQUIDADO' | 'PAGO' | 'OB_CANCELADA'
  | 'CANCELADO' | 'PRAZO_ALONGADO' | 'PRORROGACAO_LIQUIDACAO' | 'ENVIADO_COLOG' | 'FATURA_VINCULADA';

/** Registro do histórico do ciclo: marcos, pendências e prazos alongados. */
export interface PaymentCycleEvent {
  id: string;
  tipo: PaymentCycleEventTipo;
  dataEvento: string;
  sei?: string;
  numeroOb?: string;
  motivo?: string;
  origemPendencia?: 'FORNECEDOR' | 'FISCAL';
  prazoAnterior?: string;
  prazoNovo?: string;
  justificativa?: string;
  /** Na conferência: SICAF / CNDs do credor verificados. */
  regularidadeVerificada?: boolean;
  registradoPorNome?: string;
  /** Registrado pela conciliação do sistema. */
  automatico?: boolean;
  criadoEm: string;
}

/** Prazo da etapa em curso. Na cobrança da CGOFI o dono é a CGOFI e a CGLIC só acompanha. */
export interface PaymentEtapaPrazo {
  etapa: PaymentEtapa;
  dono: 'CGLIC' | 'CGOFI';
  dataAlvo: string;
  /** Dias úteis até a data-alvo; negativo = atrasado. */
  diasUteisRestantes: number;
  atrasado: boolean;
}

/**
 * Representação completa do Ciclo Operacional de Faturamento / Atesto
 */
export interface PaymentFollowUpCycle {
  /** UUID da linha em contract_payment_cycles (Fase 10-A.2). Ausente para ciclos ainda não persistidos. */
  id?: string;
  cycleKey: string;                     // Identidade canônica: {contractKey}-PGTO-{YYYYMM}-{DocIdNormalizado}
  contractKey: string;
  competencia: string;
  status: PaymentWorkflowStatus;
  input: PaymentCycleInput;
  prazos: PaymentCyclePrazos;
  /** Prazo da etapa em curso; ausente quando o ciclo está encerrado. */
  etapaAtual?: PaymentEtapaPrazo;
  /** Documentos recebidos e histórico; ausentes nas listas consolidadas do painel. */
  documentos?: PaymentCycleDocument[];
  eventos?: PaymentCycleEvent[];
  /** Itens "DO PAGAMENTO", checklist do Anexo I e faturas do Contratos.gov.br (migration 87). */
  itens?: PaymentCycleItem[];
  checklist?: PaymentChecklistAnswer[];
  faturas?: Array<{ idFatura: number; vinculadoPor: 'USUARIO' | 'SISTEMA' }>;
  alerts: PaymentAlert[];
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
