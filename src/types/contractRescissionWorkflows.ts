/**
 * Tipos de Domínio do Workflow Operacional de Extinção Antecipada / Rescisão Contratual (SaldoARP — Fase 4.4C)
 *
 * Princípios Fundamentais:
 * 1. FATO/MOTIVO → INSTRUÇÃO INTERNA → DECISÃO/FORMALIZAÇÃO → CONFIRMAÇÃO OFICIAL → EVENTO OFICIAL SOBERANO
 * 2. CONCLUSÃO INTERNA ≠ EXTINÇÃO OFICIAL SOBERANA
 * 3. TEMPLATE CONDICIONAL: Apenas tarefas para trabalho real, sem duplicação de sistemas externos (SEI, Contratos.gov.br, PNCP).
 */

import type {
  ContractExtinctionType,
  ContractExtinctionInstrument,
  ContractClosureChecklist,
  ExtinctionMotivation
} from './contractExtinctions';
import type { AmendmentOfficialityClassification } from './contractAmendments';
import type { ContractTaskPlan } from './index';

/**
 * 1. Estados Operacionais do Workflow de Extinção Antecipada / Rescisão
 */
export type ContractRescissionWorkflowStatus =
  | 'NAO_INICIADO'
  | 'EM_ANALISE'
  | 'COM_PENDENCIAS'
  | 'EM_INSTRUCAO'
  | 'AGUARDANDO_DECISAO'
  | 'EM_FORMALIZACAO'
  | 'AGUARDANDO_CONFIRMACAO'
  | 'CONCLUIDO_INTERNAMENTE'
  | 'CONCLUIDO_OFICIALMENTE'
  | 'CANCELADO';

/**
 * 2. Registro da Decisão Administrativa / Parecer Jurídico de Rescisão
 */
export interface RescissionDecisionRecord {
  status?: 'APROVADO' | 'NAO_APROVADO' | 'PENDENTE';
  decididoEm?: string; // YYYY-MM-DD
  decididoPor?: string;
  justificativa?: string;
  documentoSeiDespacho?: string;
  parecerJuridicoNumero?: string;
}

/**
 * 3. Registro dos Dados de Formalização do Termo de Rescisão / Distrato
 */
export interface RescissionFormalizationRecord {
  instrumentoFormal?: ContractExtinctionInstrument;
  numeroTermo?: string; // Ex: "Termo de Rescisão Unilateral nº 01/2026" ou "Distrato nº 02/2026"
  dataAssinatura?: string; // YYYY-MM-DD
  dataPublicacao?: string; // YYYY-MM-DD
  numeroPublicacaoPncpDoi?: string;
  linkPncp?: string;
  documentoSeiTermo?: string;
}

/**
 * 4. Registro da Confirmação Oficial Soberana da Extinção
 */
export interface RescissionOfficialConfirmation {
  confirmado: boolean;
  fonteOficial?: string;
  dataConfirmacao?: string; // ISO timestamp
  numeroControlePncp?: string;
  dataEfeitoOficial?: string;
}

/**
 * 5. Entidade do Workflow Operacional de Extinção Antecipada / Rescisão
 */
export interface ContractRescissionWorkflow {
  /** Chave lógica determinística: WF::EXTINCAO::{contractKey}::{tipoExtincao}::{cycleRef}{::identificador} */
  workflowId: string;
  contractKey: string;
  uasg: string;
  numeroContrato: string;
  anoContrato: number;
  cycleRef: string;

  tipoExtincao: ContractExtinctionType;
  status: ContractRescissionWorkflowStatus;
  dataInicio?: string;
  responsavelNome?: string;
  processoSeiId?: string;
  processoSeiNumero?: string;

  // Motivação e Checklist (Domínio 4.4A)
  motivacao: ExtinctionMotivation;
  checklist: ContractClosureChecklist;

  // Classificação de Oficialidade
  oficialidade: AmendmentOfficialityClassification;

  // Decisão Administrativa Interna
  decisao: RescissionDecisionRecord;

  // Formalização
  formalizacao: RescissionFormalizationRecord;

  // Confirmação Oficial Soberana (Eficácia)
  confirmacaoOficial: RescissionOfficialConfirmation;

  // Plano de Tarefas Dinâmico / Condicional (Fase 4.3C)
  planTarefas?: ContractTaskPlan;

  observacoes?: string;
}
