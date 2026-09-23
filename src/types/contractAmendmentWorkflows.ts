/**
 * Tipos de Domínio dos Workflows Operacionais de Alteração Contratual e Apostilamento (SaldoARP — Fase 4.3B)
 *
 * Princípios Fundamentais:
 * 1. PROPOSTA ≠ DECISÃO ≠ INSTRUMENTO FORMAL ≠ FATO OFICIAL
 * 2. TERMO ADITIVO ≠ APOSTILAMENTO
 * 3. EVENTO ≠ WORKFLOW ≠ TAREFA
 * 4. FATO OFICIAL → EVENTO → WORKFLOW → TAREFA
 */

import type {
  AmendmentType,
  AmendmentCategory,
  AmendmentInstrument,
  AmendmentValueEvolution,
  AmendmentOfficialityClassification,
  ReajusteMetadata,
  RepactuacaoMetadata,
  ApostilamentoMetadata
} from './contractAmendments';
import type { ContractTaskPlan } from './index';

/**
 * 1. Estados Operacionais do Workflow de Alteração / Apostilamento
 */
export type AmendmentWorkflowStatus =
  | 'NAO_INICIADO'
  | 'EM_ANALISE'
  | 'EM_INSTRUCAO'
  | 'AGUARDANDO_DOCUMENTACAO'
  | 'AGUARDANDO_ANALISE_JURIDICA'
  | 'AGUARDANDO_DECISAO'
  | 'AGUARDANDO_FORMALIZACAO'
  | 'AGUARDANDO_PUBLICACAO'
  | 'AGUARDANDO_CONFIRMACAO_OFICIAL'
  | 'CONCLUIDO_CONFIRMADO'
  | 'NAO_APROVADO'
  | 'CANCELADO';

/**
 * 2. Registro da Decisão Administrativa Interna (Distinta da Eficácia Oficial)
 */
export interface AmendmentDecisionRecord {
  status?: 'APROVADO' | 'NAO_APROVADO';
  decididoEm?: string; // YYYY-MM-DD
  decididoPor?: string;
  justificativaDecisao?: string;
  documentoSeiDecisao?: string;
}

/**
 * 3. Registro dos Dados de Formalização do Instrumento
 */
export interface AmendmentFormalizationRecord {
  numeroTermo?: string; // Ex: "1º Termo Aditivo" ou "Termo de Apostilamento nº 02/2026"
  dataAssinatura?: string; // YYYY-MM-DD
  dataPublicacao?: string; // YYYY-MM-DD
  numeroPublicacaoPncpDoi?: string;
  linkPncp?: string;
  documentoSeiTermo?: string;
}

/**
 * 4. Registro da Confirmação Oficial Soberana (Eficácia via PNCP / Contratos.gov.br)
 */
export interface AmendmentOfficialConfirmation {
  confirmado: boolean;
  fonteOficial?: string;
  dataConfirmacao?: string; // ISO timestamp
  numeroControlePncp?: string;
  valorOficialConfirmado?: number;
  vigenciaOficialConfirmada?: string;
}

/**
 * 5. Entidade do Workflow Operacional de Alteração Contratual / Apostilamento
 */
export interface ContractAmendmentWorkflow {
  /** Chave lógica determinística: WF::ALTERACAO::{contractKey}::{tipoAlteracao}::{cycleRef} */
  workflowId: string;
  contractKey: string;
  uasg: string;
  numeroContrato: string;
  anoContrato: number;
  cycleRef: string; // Ex: VIG_20270115

  tipoAlteracao: AmendmentType;
  categoria: AmendmentCategory;
  naturezaInstrumento: AmendmentInstrument;
  status: AmendmentWorkflowStatus;

  dataInicio?: string;
  responsavelNome?: string;
  processoSeiId?: string;
  processoSeiNumero?: string;

  objetoDescricao: string;
  justificativa: string;

  // Rastreabilidade de Valores e Propostas
  valores: AmendmentValueEvolution;

  // Classificação de Oficialidade
  oficialidade: AmendmentOfficialityClassification;

  // Decisão Administrativa Interna
  decisao: AmendmentDecisionRecord;

  // Dados de Formalização do Instrumento
  formalizacao: AmendmentFormalizationRecord;

  // Confirmação Oficial Soberana (Eficácia)
  confirmacaoOficial: AmendmentOfficialConfirmation;

  // Metadados Específicos por Tipo de Alteração
  reajusteMeta?: ReajusteMetadata;
  repactuacaoMeta?: RepactuacaoMetadata;
  apostilamentoMeta?: ApostilamentoMetadata;

  // Vínculo com Plano de Tarefas
  planTarefas?: ContractTaskPlan;

  observacoes?: string;
}
