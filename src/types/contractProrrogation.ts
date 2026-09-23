/**
 * Tipos de Domínio do Workflow de Prorrogação Contratual (SaldoARP — Fase 4.2)
 *
 * Princípios Fundamentais:
 * 1. FATO OFICIAL ≠ EVENTO ≠ WORKFLOW ≠ TAREFA
 * 2. TRIGGER ≠ DECISÃO (A prorrogação é faculdade administrativa dependente de vantajosidade e aceite)
 * 3. ALERTA ≠ BLOQUEIO (Assistência e checklist orientativo sem decisões cegas de máquina)
 * 4. Preservação de Ciclos e Explicabilidade Histórica
 */

import type { TemporalStatus, AtencaoNivel } from './temporal';
import type { ContractTaskPlan } from './index';

/**
 * Estados Operacionais do Processo/Workflow de Prorrogação
 */
export type ProrrogationWorkflowStatus =
  | 'NAO_INICIADO'
  | 'EM_ANALISE_INTERESSE'
  | 'AGUARDANDO_FORNECEDOR'
  | 'EM_PESQUISA_PRECOS'
  | 'EM_INSTRUCAO_MINUTA'
  | 'EM_ANALISE_JURIDICA'
  | 'AGUARDANDO_ASSINATURA_PUBLICACAO'
  | 'CONCLUIDO_PRORROGADO'
  | 'CONCLUIDO_NAO_PRORROGADO'
  | 'CANCELADO';

/**
 * Status da manifestação do fornecedor
 */
export type FornecedorManifestacaoStatus = 'PENDENTE' | 'CONFIRMADO' | 'RECUSADO';

/**
 * Checklist Assistido de Prontidão e Conformidade Legal (Art. 106/107 Lei 14.133/21)
 */
export interface ProrrogationReadinessChecklist {
  interessePublicoManifesto: boolean;
  fornecedorConcordancia: boolean;
  vantajosidadePrecoComprovada: boolean;
  regularidadeFiscalValida: boolean;
  parecerJuridicoAprovado: boolean;
  tempestividadeGarantida: boolean; // Assinatura prévia à expiração da vigência atual
  itensPendentes: string[];
  isProntoParaAssinatura: boolean;
  orientacoes: string[];
}

/**
 * Cronograma Operacional e Prazos do Workflow de Prorrogação
 */
export interface ProrrogationDeadlinesPlan {
  dataVigenciaAtual: string;
  inicioAnalise180d: string;
  consultaFornecedor120d: string;
  prazoRespostaFornecedor10du: string;
  pesquisaPrecos90d: string;
  remessaJuridica60d: string;
  previsaoAssinatura15d: string;
  limitePeremptorioVigencia0d: string;
  diasRestantesVigencia: number;
  estadoTemporal: TemporalStatus;
  nivelAtencao: AtencaoNivel;
}

/**
 * Entidade do Workflow de Prorrogação Contratual (Camada 3: Processo Operacional)
 */
export interface ContractProrrogationWorkflow {
  /** Chave lógica determinística: WF::PRORROGACAO::{contractKey}::{cycleRef} */
  workflowId: string;
  contractKey: string;
  uasg: string;
  numeroContrato: string;
  anoContrato: number;
  cycleRef: string; // Ex: VIG_20270115

  status: ProrrogationWorkflowStatus;
  dataInicio?: string;
  dataVigenciaAtual: string;
  novaVigenciaPretendida: string;
  prazoLimiteConclusao: string; // Data final da vigência corrente

  // Responsabilidade
  responsavelGestorNome?: string;
  processoSeiId?: string;
  processoSeiNumero?: string;

  // Instrução e Habilitação
  manifestacaoFornecedor: FornecedorManifestacaoStatus;
  manifestacaoFornecedorData?: string;
  manifestacaoFornecedorDocumentoSei?: string;
  vantajosidadeComprovada: boolean;
  vantajosidadeDocumentoSei?: string;
  regularidadeFiscalSicaf: boolean;
  regularidadeFiscalValidade?: string;

  // Jurídico e Formalização
  parecerConjurNumero?: string;
  parecerConjurFavoravel?: boolean;
  termoAditivoNumero?: string;
  termoAditivoPublicadoEm?: string;
  termoAditivoLinkPncp?: string;

  // Decisão e Encerramento do Workflow
  decisaoFinal?: 'PRORROGAR' | 'NAO_PRORROGAR';
  decisaoJustificativa?: string;
  decididoEm?: string;
  decididoPor?: string;
  concluidoEm?: string;
  observacoes?: string;

  // Cronograma e Checklist de Avaliação Assistida
  deadlinesPlan: ProrrogationDeadlinesPlan;
  readiness: ProrrogationReadinessChecklist;

  // Vínculo com o Plano de Tarefas Concreto
  planTarefas?: ContractTaskPlan;
}
