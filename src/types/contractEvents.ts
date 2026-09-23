/**
 * Tipos de Domínio de Gestão de Eventos e Ciclos Contratuais (SaldoARP — Fase 4)
 *
 * Princípios Fundamentais:
 * 1. FATO OFICIAL ≠ EVENTO ≠ WORKFLOW ≠ TAREFA
 * 2. Assistência, Não Decisão Jurídica (Badges e Alertas de Conformidade, sem bloqueios cegos)
 * 3. Preservação Estrita da Rastreabilidade e Transição Determinística de Ciclos
 */

import type { TemporalStatus, AtencaoNivel } from './temporal';

/**
 * 1. Naturezas / Tipos Canônicos de Eventos Contratuais (Fatos Formais)
 */
export type ContractEventType =
  | 'CELEBRACAO'
  | 'PRORROGACAO'
  | 'REAJUSTE'
  | 'REPACTUACAO'
  | 'ACRESCIMO'
  | 'SUPRESSAO'
  | 'APOSTILAMENTO'
  | 'ENCERRAMENTO'
  | 'RESCISAO';

/**
 * Instrumento formal que materializa o evento
 */
export type ContractEventNature =
  | 'CONTRATO_INICIAL'
  | 'TERMO_ADITIVO'
  | 'TERMO_APOSTILAMENTO'
  | 'TERMO_RECEBIMENTO_DEFINITIVO'
  | 'NOTIFICACAO_RESCISAO'
  | 'REGISTRO_ADMINISTRATIVO';

/**
 * Fonte oficial soberana ou interna do evento
 */
export type ContractEventSource =
  | 'PNCP'
  | 'Contratos.gov.br'
  | 'Compras.gov.br'
  | 'SEI'
  | 'SaldoARP'
  | 'INTERNO';

/**
 * Tipo de impacto direto do evento no contrato
 */
export type ContractEventImpact =
  | 'ALTERA_VIGENCIA'
  | 'ALTERA_VALOR'
  | 'ALTERA_QUANTITATIVO'
  | 'ATUALIZA_DADOS'
  | 'EXTINGUE_CONTRATO'
  | 'SEM_IMPACTO_FINANCEIRO_TEMPORAL';

/**
 * Estados do Ciclo de Vida do Contrato
 */
export type ContractLifecycleState =
  | 'VIGENTE'
  | 'EM_PRORROGACAO'
  | 'EM_REAJUSTE'
  | 'EM_REPACTUACAO'
  | 'EM_ALTERACAO'
  | 'EM_ENCERRAMENTO'
  | 'ENCERRADO'
  | 'RESCINDIDO';

/**
 * Interface do Evento Contratual (Camada 2: Fato Formal Ocorrido)
 */
export interface ContractEvent {
  /** Chave lógica canônica e determinística: CONTRATO::{contractKey}::{tipoEvento}::{identificadorOficial}::{cicloRef} */
  id: string;
  contractKey: string;
  uasg: string;
  numeroContrato: string;
  anoContrato: number;

  tipoEvento: ContractEventType;
  naturezaInstrumento: ContractEventNature;
  numeroSequencial?: number | string; // Ex: 1 para "1º Termo Aditivo"
  identificadorOficial: string; // Ex: "TA-01/2026" ou "APOST-02/2026"
  descricao: string;

  // Datas formais
  dataAssinatura?: string; // YYYY-MM-DD
  dataPublicacao?: string; // YYYY-MM-DD
  dataVigenciaEfeito?: string; // YYYY-MM-DD

  // Impactos Formais no Instrumento
  impacto: ContractEventImpact;
  vigenciaAnterior?: string;
  vigenciaPosterior?: string;
  valorAnterior?: number;
  valorPosterior?: number;
  variacaoValor?: number;
  percentualVariacaoValor?: number;

  // Rastreabilidade e Origem Oficial
  fonteOrigem: ContractEventSource;
  numeroControlePncp?: string;
  linkPncp?: string;
  processoSeiNumero?: string;
  sourceUpdatedAt?: string;
  capturedAt: string;

  // Metadados adicionais
  rawOfficialData?: any;
}

/**
 * Explicabilidade da Transição de Vigência e Ciclo Temporal
 */
export interface ContractVigenciaTransition {
  contractKey: string;
  vigenciaAnterior: string;
  novaVigencia: string;
  eventoGeradorId: string;
  eventoDescricao: string;
  dataPublicacaoEvento?: string;
  fonteOficialConfirmadora: string;
  novoCicloRef: string;
  novoGatilhoId: string;
  novoGatilhoDataAlvo: string;
  diasRestantesNovoCiclo: number;
  estadoTemporalNovoCiclo: TemporalStatus;
  nivelAtencaoNovoCiclo: AtencaoNivel;
  explicabilidadeTexto: string;
}

/**
 * Avaliação Assistida de Limites Legais de Aditamento (Art. 125 e 126 da Lei 14.133/2021)
 * ATENÇÃO: Verificação assistida e alerta de conformidade, NUNCA bloqueio cego.
 */
export type ConformidadeLimiteStatus =
  | 'CONFORME'
  | 'ATENCAO_REFORMA'
  | 'ALERTA_EXCEDE_ORDINARIO';

export interface AditamentoLimitEvaluation {
  valorInicialAtualizado: number;
  totalAcrescimos: number;
  percentualAcrescimo: number;
  totalSupressoes: number;
  percentualSupressao: number;
  isReforma: boolean;
  tetoAcrescimoPermitidoPercentual: number; // 25 ou 50
  tetoSupressaoPermitidoPercentual: number; // 25
  statusAcrescimo: ConformidadeLimiteStatus;
  statusSupressao: 'CONFORME' | 'ALERTA_EXCEDE_ORDINARIO_EXIGE_CONSENSO';
  badgeAcrescimo: {
    color: 'verde' | 'amarelo' | 'vermelho';
    label: string;
    orientacao: string;
  };
  badgeSupressao: {
    color: 'verde' | 'amarelo' | 'vermelho';
    label: string;
    orientacao: string;
  };
  podeRegistrarComJustificativa: boolean; // Sempre TRUE (assistência, não bloqueio jurídico)
}

/**
 * Definição Conceitual de Workflow Futuro (Camada 3: Processo Operacional)
 * Presente no domínio para demarcar a fronteira conceitual sem implementar automação nesta etapa.
 */
export type ContractWorkflowType =
  | 'PRORROGACAO_CONTRATUAL'
  | 'REAJUSTE_PRECOS'
  | 'REPACTUACAO_SALARIAL'
  | 'ALTERACAO_QUALITATIVA_QUANTITATIVA'
  | 'APOSTILAMENTO_ADMINISTRATIVO'
  | 'ENCERRAMENTO_CONTRATUAL';

export type ContractWorkflowStatus =
  | 'NAO_INICIADO'
  | 'EM_INSTRUCAO'
  | 'AGUARDANDO_FORNECEDOR'
  | 'EM_PESQUISA_PRECOS'
  | 'EM_ANALISE_JURIDICA'
  | 'AGUARDANDO_PUBLICACAO'
  | 'CONCLUIDO'
  | 'ARQUIVADO_CANCELADO';

export interface ContractWorkflowSummary {
  workflowType: ContractWorkflowType;
  status: ContractWorkflowStatus;
  dataInicio?: string;
  dataPrevisaoConclusao?: string;
  processoSeiId?: string;
  responsavelNome?: string;
  totalTarefas: number;
  tarefasConcluidas: number;
}
