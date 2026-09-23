/**
 * Tipos de Domínio do Workflow Operacional de Encerramento Contratual Regular (SaldoARP — Fase 4.4B)
 *
 * Princípios Fundamentais:
 * 1. FIM DA VIGÊNCIA ≠ ENCERRAMENTO OPERACIONAL ≠ EXTINÇÃO CONTRATUAL ≠ FATO OFICIAL CONFIRMADO
 * 2. PRINCÍPIO DA NÃO DUPLICAÇÃO: O SaldoARP gerencia pendências, contexto e decisões; sistemas oficiais são a fonte soberana.
 * 3. TEMPLATE CONDICIONAL: Tarefas só existem se houver trabalho real (não cria tarefas para o que não se aplica).
 * 4. CONCLUSÃO INTERNA ≠ ENCERRAMENTO OFICIAL SOBERANO
 */

import type {
  ContractExtinctionInstrument,
  ContractClosureChecklist
} from './contractExtinctions';
import type { AmendmentOfficialityClassification } from './contractAmendments';
import type { ContractTaskPlan } from './index';

/**
 * 1. Estados Operacionais do Workflow de Encerramento Regular
 */
export type ContractClosureWorkflowStatus =
  | 'NAO_INICIADO'
  | 'EM_ANALISE'
  | 'COM_PENDENCIAS'
  | 'EM_FORMALIZACAO'
  | 'AGUARDANDO_CONFIRMACAO'
  | 'CONCLUIDO_INTERNAMENTE'
  | 'CONCLUIDO_OFICIALMENTE'
  | 'CANCELADO';

/**
 * 2. Registro de Decisão Administrativa de Encerramento Interno
 */
export interface ClosureDecisionRecord {
  status?: 'CONCLUIDO_INTERNAMENTE' | 'PENDENTE' | 'SUSPENSO';
  decididoEm?: string; // YYYY-MM-DD
  decididoPor?: string;
  justificativa?: string;
  documentoSeiDespacho?: string;
}

/**
 * 3. Registro de Formalização do Termo de Encerramento / TRD
 */
export interface ClosureFormalizationRecord {
  instrumentoFormal?: ContractExtinctionInstrument;
  numeroTermo?: string; // Ex: "TRD nº 01/2026" ou "Termo de Encerramento nº 02/2026"
  dataAssinatura?: string; // YYYY-MM-DD
  dataPublicacao?: string; // YYYY-MM-DD
  numeroPublicacaoPncpDoi?: string;
  linkPncp?: string;
  documentoSeiTermo?: string;
}

/**
 * 4. Registro de Confirmação Oficial Soberana da Extinção
 */
export interface ClosureOfficialConfirmation {
  confirmado: boolean;
  fonteOficial?: string;
  dataConfirmacao?: string; // ISO timestamp
  numeroControlePncp?: string;
  dataEfeitoOficial?: string;
}

/**
 * 5. Entidade do Workflow Operacional de Encerramento Regular
 */
export interface ContractClosureWorkflow {
  /** Chave lógica determinística: WF::ENCERRAMENTO::{contractKey}::{cycleRef}{::identificador} */
  workflowId: string;
  contractKey: string;
  uasg: string;
  numeroContrato: string;
  anoContrato: number;
  cycleRef: string;

  status: ContractClosureWorkflowStatus;
  dataInicio?: string;
  responsavelNome?: string;
  processoSeiId?: string;
  processoSeiNumero?: string;

  // Checklist e Gestão de Pendências (Fase 4.4A)
  checklist: ContractClosureChecklist;

  // Classificação de Oficialidade
  oficialidade: AmendmentOfficialityClassification;

  // Decisão Administrativa Interna
  decisao: ClosureDecisionRecord;

  // Formalização
  formalizacao: ClosureFormalizationRecord;

  // Confirmação Oficial Soberana (Eficácia)
  confirmacaoOficial: ClosureOfficialConfirmation;

  // Plano de Tarefas Dinâmico / Condicional (Fase 4.3C)
  planTarefas?: ContractTaskPlan;

  observacoes?: string;
}
