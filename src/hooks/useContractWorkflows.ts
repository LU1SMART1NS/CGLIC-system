import { useMemo } from 'react';
import type {
  ContractDashboardRecord,
  ContractTaskPlan,
  ContractProrrogationWorkflow,
  ContractAmendmentWorkflow,
  ContractClosureWorkflow,
  ContractRescissionWorkflow,
  AmendmentType
} from '../types';
import { useContractTaskPlan } from './useContractTaskPlan';
import {
  assembleProrrogationWorkflow,
  calculateProrrogationDeadlines
} from '../services/contractProrrogationService';
import { assembleAmendmentWorkflow } from '../services/contractAmendmentWorkflowService';
import { assembleClosureWorkflow } from '../services/contractClosureWorkflowService';
import { assembleRescissionWorkflow } from '../services/contractRescissionWorkflowService';
import { classifyTaskAttention } from '../components/contracts/ContractAttentionCenter';

// ============================================================================
// VIEW MODEL / APRESENTAÇÃO (NÃO É NOVO DOMÍNIO DE NEGÓCIO)
// ============================================================================

export type WorkflowKind = 'PRORROGACAO' | 'ALTERACAO' | 'ENCERRAMENTO' | 'EXTINCAO';

export type MacrostepStatus = 'CONCLUIDA' | 'ATUAL' | 'FUTURA';

export interface WorkflowMacrostepItem {
  id: string;
  label: string;
  status: MacrostepStatus;
  ordem: number;
}

export interface ContractWorkflowPresentationItem {
  id: string;
  kind: WorkflowKind;
  tipoNomeAmigavel: string;
  statusRaw: string;
  statusLabel: string;
  statusVariant: 'info' | 'warning' | 'success' | 'danger' | 'neutral';
  isActive: boolean;
  isCompleted: boolean;
  hasAttention: boolean;
  etapaAtual: string;
  progresso: {
    concluidas: number;
    total: number;
    percentual: number;
  };
  macroetapas: WorkflowMacrostepItem[];
  proximaAcao?: string;
  proximaTarefa?: {
    id: string;
    nome: string;
    responsavelNome?: string;
    prazo?: string;
    atencaoNivel?: string;
    diasRestantes?: number | null;
  };
  responsavelNome?: string;
  prazoLimite?: string;
  processoSeiNumero?: string;
  // Referência ao agregado canônico de domínio da Fase 4
  canonicalWorkflow:
    | ContractProrrogationWorkflow
    | ContractAmendmentWorkflow
    | ContractClosureWorkflow
    | ContractRescissionWorkflow;
}

export interface UseContractWorkflowsResult {
  workflows: ContractWorkflowPresentationItem[];
  activeCount: number;
  completedCount: number;
  isLoading: boolean;
  error: Error | null;
}

// ============================================================================
// FUNÇÕES AUXILIARES DE PROJEÇÃO DE MACROETAPAS (PURAS)
// ============================================================================

function findNextPendingTask(plan?: ContractTaskPlan | null): ContractWorkflowPresentationItem['proximaTarefa'] | undefined {
  if (!plan || !plan.macrotarefas) return undefined;

  for (const macro of plan.macrotarefas) {
    for (const task of macro.tarefas) {
      if (task.status === 'PENDENTE' || task.status === 'EM_ANDAMENTO') {
        const att = classifyTaskAttention(task);
        return {
          id: task.id,
          nome: task.nome,
          responsavelNome: task.responsavelNome,
          prazo: task.prazo,
          atencaoNivel: att.level,
          diasRestantes: att.diasRestantes
        };
      }
    }
  }
  return undefined;
}

function hasPlanAttention(plan?: ContractTaskPlan | null): boolean {
  if (!plan || !plan.macrotarefas) return false;
  return plan.macrotarefas.some(m =>
    m.tarefas.some(t => {
      if (t.status === 'CONCLUIDA' || t.status === 'NAO_APLICAVEL') return false;
      const att = classifyTaskAttention(t);
      return att.level === 'VENCIDA' || att.level === 'HOJE' || att.level === 'URGENTE';
    })
  );
}

// ----------------------------------------------------------------------------
// 1. Projeção de Prorrogação (Fase 4.2)
// ----------------------------------------------------------------------------
function projectProrrogation(
  contract: ContractDashboardRecord,
  plan?: ContractTaskPlan | null
): ContractWorkflowPresentationItem {
  const isProrrPlan =
    plan?.templateId === 'tpl-prorrogacao-padrao-14133' ||
    Boolean(plan?.templateNome?.toLowerCase().includes('prorroga'));

  const wf = assembleProrrogationWorkflow({
    contract,
    plan: isProrrPlan ? plan : undefined
  });

  const deadlines = calculateProrrogationDeadlines(contract.dataVigenciaFim || '');

  const macroetapas: WorkflowMacrostepItem[] = [
    { id: 'macro-prorr-1', label: 'Avaliação de Interesse e Consulta', status: 'FUTURA', ordem: 1 },
    { id: 'macro-prorr-2', label: 'Economicidade e Habilitação', status: 'FUTURA', ordem: 2 },
    { id: 'macro-prorr-3', label: 'Minuta e Análise Jurídica', status: 'FUTURA', ordem: 3 },
    { id: 'macro-prorr-4', label: 'Assinatura e Publicação PNCP', status: 'FUTURA', ordem: 4 }
  ];

  let etapaAtual = 'Avaliação de Interesse e Consulta';
  let statusVariant: ContractWorkflowPresentationItem['statusVariant'] = 'info';

  switch (wf.status) {
    case 'CONCLUIDO_PRORROGADO':
      macroetapas.forEach(m => (m.status = 'CONCLUIDA'));
      etapaAtual = 'Ciclo Concluído (Prorrogado)';
      statusVariant = 'success';
      break;
    case 'CONCLUIDO_NAO_PRORROGADO':
      macroetapas[0].status = 'CONCLUIDA';
      etapaAtual = 'Encerrado sem Prorrogação';
      statusVariant = 'neutral';
      break;
    case 'AGUARDANDO_ASSINATURA_PUBLICACAO':
      macroetapas[0].status = 'CONCLUIDA';
      macroetapas[1].status = 'CONCLUIDA';
      macroetapas[2].status = 'CONCLUIDA';
      macroetapas[3].status = 'ATUAL';
      etapaAtual = 'Assinatura e Publicação PNCP';
      statusVariant = 'warning';
      break;
    case 'EM_INSTRUCAO_MINUTA':
    case 'EM_ANALISE_JURIDICA':
      macroetapas[0].status = 'CONCLUIDA';
      macroetapas[1].status = 'CONCLUIDA';
      macroetapas[2].status = 'ATUAL';
      etapaAtual = wf.status === 'EM_ANALISE_JURIDICA' ? 'Parecer Conjur / Análise Jurídica' : 'Instrução da Minuta';
      statusVariant = 'info';
      break;
    case 'EM_PESQUISA_PRECOS':
      macroetapas[0].status = 'CONCLUIDA';
      macroetapas[1].status = 'ATUAL';
      etapaAtual = 'Pesquisa de Preços e Vantajosidade';
      statusVariant = 'info';
      break;
    case 'AGUARDANDO_FORNECEDOR':
      macroetapas[0].status = 'ATUAL';
      etapaAtual = 'Aguardando Manifestação do Fornecedor';
      statusVariant = 'warning';
      break;
    case 'EM_ANALISE_INTERESSE':
    case 'NAO_INICIADO':
    default:
      macroetapas[0].status = 'ATUAL';
      etapaAtual = 'Avaliação de Interesse Público';
      statusVariant = wf.status === 'NAO_INICIADO' ? 'neutral' : 'info';
      break;
    case 'CANCELADO':
      etapaAtual = 'Workflow Cancelado';
      statusVariant = 'neutral';
      break;
  }

  const concluidasCount = macroetapas.filter(m => m.status === 'CONCLUIDA').length;
  const isCompleted = wf.status === 'CONCLUIDO_PRORROGADO' || wf.status === 'CONCLUIDO_NAO_PRORROGADO';
  const isActive = !isCompleted && wf.status !== 'CANCELADO';

  const hasTemporalAttention =
    deadlines?.nivelAtencao === 'CRITICO' || deadlines?.nivelAtencao === 'ATENCAO';
  const hasTaskAttention = isProrrPlan ? hasPlanAttention(plan) : false;

  const statusLabels: Record<string, string> = {
    NAO_INICIADO: 'Não Iniciado',
    EM_ANALISE_INTERESSE: 'Em Análise de Interesse',
    AGUARDANDO_FORNECEDOR: 'Aguardando Fornecedor',
    EM_PESQUISA_PRECOS: 'Em Pesquisa de Preços',
    EM_INSTRUCAO_MINUTA: 'Em Instrução de Minuta',
    EM_ANALISE_JURIDICA: 'Em Análise Jurídica',
    AGUARDANDO_ASSINATURA_PUBLICACAO: 'Aguardando Assinatura/Publicação',
    CONCLUIDO_PRORROGADO: 'Concluído (Prorrogado)',
    CONCLUIDO_NAO_PRORROGADO: 'Concluído (Não Prorrogado)',
    CANCELADO: 'Cancelado'
  };

  return {
    id: wf.workflowId,
    kind: 'PRORROGACAO',
    tipoNomeAmigavel: 'Prorrogação Contratual (Lei 14.133/21)',
    statusRaw: wf.status,
    statusLabel: statusLabels[wf.status] || wf.status,
    statusVariant,
    isActive,
    isCompleted,
    hasAttention: hasTemporalAttention || hasTaskAttention,
    etapaAtual,
    progresso: {
      concluidas: concluidasCount,
      total: macroetapas.length,
      percentual: Math.round((concluidasCount / macroetapas.length) * 100)
    },
    macroetapas,
    proximaAcao:
      wf.status === 'AGUARDANDO_FORNECEDOR'
        ? 'Aguardar resposta formal do fornecedor (prazo 10 dias úteis)'
        : wf.status === 'AGUARDANDO_ASSINATURA_PUBLICACAO'
        ? 'Coletar assinaturas no SEI e publicar no PNCP'
        : undefined,
    proximaTarefa: isProrrPlan ? findNextPendingTask(plan) : undefined,
    responsavelNome: wf.responsavelGestorNome,
    prazoLimite: wf.prazoLimiteConclusao,
    processoSeiNumero: wf.processoSeiNumero || contract.processo,
    canonicalWorkflow: wf
  };
}

// ----------------------------------------------------------------------------
// 2. Projeção de Alterações / Apostilamento (Fase 4.3B)
// ----------------------------------------------------------------------------
function projectAmendment(
  contract: ContractDashboardRecord,
  plan: ContractTaskPlan
): ContractWorkflowPresentationItem {
  let tipoAlteracao: AmendmentType = 'ACRESCIMO';
  const tplId = plan.templateId || '';
  const tplNome = (plan.templateNome || '').toLowerCase();

  if (tplId.includes('supressao') || tplNome.includes('supress')) tipoAlteracao = 'SUPRESSAO';
  else if (tplId.includes('reajuste') || tplNome.includes('reajuste')) tipoAlteracao = 'REAJUSTE';
  else if (tplId.includes('repactuacao') || tplNome.includes('repactua')) tipoAlteracao = 'REPACTUACAO';
  else if (tplId.includes('apostilamento') || tplNome.includes('apostila')) tipoAlteracao = 'OUTRA_ALTERACAO';
  else if (tplId.includes('qualitativa') || tplNome.includes('qualitativ')) tipoAlteracao = 'ALTERACAO_QUALITATIVA';

  const wf = assembleAmendmentWorkflow({
    contract,
    tipoAlteracao,
    objetoDescricao: plan.templateNome || 'Alteração Contratual',
    justificativa: 'Instrução do plano de gestão de tarefas',
    planTarefas: plan
  });

  const macroetapas: WorkflowMacrostepItem[] = [
    { id: 'macro-amend-1', label: 'Instrução Técnica e Limites', status: 'FUTURA', ordem: 1 },
    { id: 'macro-amend-2', label: 'Análise Jurídica Conjur', status: 'FUTURA', ordem: 2 },
    { id: 'macro-amend-3', label: 'Decisão e Formalização', status: 'FUTURA', ordem: 3 },
    { id: 'macro-amend-4', label: 'Publicação e Confirmação Oficial', status: 'FUTURA', ordem: 4 }
  ];

  let etapaAtual = 'Instrução Técnica e Limites';
  let statusVariant: ContractWorkflowPresentationItem['statusVariant'] = 'info';

  switch (wf.status) {
    case 'CONCLUIDO_CONFIRMADO':
      macroetapas.forEach(m => (m.status = 'CONCLUIDA'));
      etapaAtual = 'Concluído e Confirmado Oficialmente';
      statusVariant = 'success';
      break;
    case 'AGUARDANDO_CONFIRMACAO_OFICIAL':
    case 'AGUARDANDO_PUBLICACAO':
      macroetapas[0].status = 'CONCLUIDA';
      macroetapas[1].status = 'CONCLUIDA';
      macroetapas[2].status = 'CONCLUIDA';
      macroetapas[3].status = 'ATUAL';
      etapaAtual = wf.status === 'AGUARDANDO_CONFIRMACAO_OFICIAL' ? 'Aguardando Eficácia PNCP' : 'Aguardando Publicação';
      statusVariant = 'warning';
      break;
    case 'AGUARDANDO_FORMALIZACAO':
    case 'AGUARDANDO_DECISAO':
      macroetapas[0].status = 'CONCLUIDA';
      macroetapas[1].status = 'CONCLUIDA';
      macroetapas[2].status = 'ATUAL';
      etapaAtual = wf.status === 'AGUARDANDO_DECISAO' ? 'Aguardando Decisão Superior' : 'Elaboração e Assinatura do Termo';
      statusVariant = 'info';
      break;
    case 'AGUARDANDO_ANALISE_JURIDICA':
      macroetapas[0].status = 'CONCLUIDA';
      macroetapas[1].status = 'ATUAL';
      etapaAtual = 'Parecer da Consultoria Jurídica';
      statusVariant = 'info';
      break;
    case 'NAO_APROVADO':
      macroetapas[0].status = 'CONCLUIDA';
      etapaAtual = 'Proposta Não Aprovada';
      statusVariant = 'danger';
      break;
    case 'CANCELADO':
      etapaAtual = 'Workflow Cancelado';
      statusVariant = 'neutral';
      break;
    case 'EM_ANALISE':
    case 'EM_INSTRUCAO':
    case 'AGUARDANDO_DOCUMENTACAO':
    case 'NAO_INICIADO':
    default:
      macroetapas[0].status = 'ATUAL';
      etapaAtual = 'Instrução Técnica e Motivação';
      statusVariant = wf.status === 'NAO_INICIADO' ? 'neutral' : 'info';
      break;
  }

  const concluidasCount = macroetapas.filter(m => m.status === 'CONCLUIDA').length;
  const isCompleted = wf.status === 'CONCLUIDO_CONFIRMADO' || wf.status === 'NAO_APROVADO';
  const isActive = !isCompleted && wf.status !== 'CANCELADO';

  const statusLabels: Record<string, string> = {
    NAO_INICIADO: 'Não Iniciado',
    EM_ANALISE: 'Em Análise',
    EM_INSTRUCAO: 'Em Instrução',
    AGUARDANDO_DOCUMENTACAO: 'Aguardando Documentação',
    AGUARDANDO_ANALISE_JURIDICA: 'Em Análise Jurídica',
    AGUARDANDO_DECISAO: 'Aguardando Decisão',
    AGUARDANDO_FORMALIZACAO: 'Em Formalização',
    AGUARDANDO_PUBLICACAO: 'Aguardando Publicação',
    AGUARDANDO_CONFIRMACAO_OFICIAL: 'Aguardando Eficácia PNCP',
    CONCLUIDO_CONFIRMADO: 'Concluído e Confirmado',
    NAO_APROVADO: 'Não Aprovado',
    CANCELADO: 'Cancelado'
  };

  const tipoLabels: Record<string, string> = {
    ACRESCIMO: 'Alteração Contratual — Acréscimo Quantitativo',
    SUPRESSAO: 'Alteração Contratual — Supressão',
    REAJUSTE: 'Apostilamento de Reajuste de Preços',
    REPACTUACAO: 'Termo Aditivo de Repactuação',
    QUALITATIVA: 'Alteração Qualitativa de Objeto',
    APOSTILAMENTO_OUTROS: 'Termo de Apostilamento'
  };

  return {
    id: wf.workflowId,
    kind: 'ALTERACAO',
    tipoNomeAmigavel: tipoLabels[tipoAlteracao] || `Alteração — ${tipoAlteracao}`,
    statusRaw: wf.status,
    statusLabel: statusLabels[wf.status] || wf.status,
    statusVariant,
    isActive,
    isCompleted,
    hasAttention: hasPlanAttention(plan),
    etapaAtual,
    progresso: {
      concluidas: concluidasCount,
      total: macroetapas.length,
      percentual: Math.round((concluidasCount / macroetapas.length) * 100)
    },
    macroetapas,
    proximaTarefa: findNextPendingTask(plan),
    responsavelNome: wf.responsavelNome,
    processoSeiNumero: wf.processoSeiNumero || contract.processo,
    canonicalWorkflow: wf
  };
}

// ----------------------------------------------------------------------------
// 3. Projeção de Encerramento Regular (Fase 4.4B)
// ----------------------------------------------------------------------------
function projectClosure(
  contract: ContractDashboardRecord,
  plan?: ContractTaskPlan | null
): ContractWorkflowPresentationItem {
  const isClosePlan =
    plan?.templateId === 'tpl-encerramento-condicional-14133' ||
    Boolean(plan?.templateNome?.toLowerCase().includes('encerra'));

  const wf = assembleClosureWorkflow({
    contract,
    planTarefas: isClosePlan ? plan : undefined
  });

  const macroetapas: WorkflowMacrostepItem[] = [
    { id: 'macro-close-1', label: 'Verificação de Obrigações e TRD', status: 'FUTURA', ordem: 1 },
    { id: 'macro-close-2', label: 'Formalização do Encerramento', status: 'FUTURA', ordem: 2 },
    { id: 'macro-close-3', label: 'Confirmação Oficial no PNCP', status: 'FUTURA', ordem: 3 }
  ];

  let etapaAtual = 'Verificação de Obrigações e TRD';
  let statusVariant: ContractWorkflowPresentationItem['statusVariant'] = 'info';

  switch (wf.status) {
    case 'CONCLUIDO_OFICIALMENTE':
      macroetapas.forEach(m => (m.status = 'CONCLUIDA'));
      etapaAtual = 'Extinção Confirmada Soberanamente';
      statusVariant = 'success';
      break;
    case 'AGUARDANDO_CONFIRMACAO':
      macroetapas[0].status = 'CONCLUIDA';
      macroetapas[1].status = 'CONCLUIDA';
      macroetapas[2].status = 'ATUAL';
      etapaAtual = 'Aguardando Confirmação no PNCP';
      statusVariant = 'warning';
      break;
    case 'CONCLUIDO_INTERNAMENTE':
    case 'EM_FORMALIZACAO':
      macroetapas[0].status = 'CONCLUIDA';
      macroetapas[1].status = 'ATUAL';
      etapaAtual = wf.status === 'CONCLUIDO_INTERNAMENTE' ? 'Concluído Internamente (Aguardando Registro)' : 'Elaboração do Termo de Encerramento';
      statusVariant = 'info';
      break;
    case 'COM_PENDENCIAS':
      macroetapas[0].status = 'ATUAL';
      etapaAtual = 'Pendências Impeditivas (TRD / Saldo / Garantia)';
      statusVariant = 'danger';
      break;
    case 'CANCELADO':
      etapaAtual = 'Workflow Cancelado';
      statusVariant = 'neutral';
      break;
    case 'EM_ANALISE':
    case 'NAO_INICIADO':
    default:
      macroetapas[0].status = 'ATUAL';
      etapaAtual = 'Análise de Obrigações Contratuais';
      statusVariant = wf.status === 'NAO_INICIADO' ? 'neutral' : 'info';
      break;
  }

  const concluidasCount = macroetapas.filter(m => m.status === 'CONCLUIDA').length;
  const isCompleted = wf.status === 'CONCLUIDO_OFICIALMENTE';
  const isActive = !isCompleted && wf.status !== 'CANCELADO';

  const statusLabels: Record<string, string> = {
    NAO_INICIADO: 'Não Iniciado',
    EM_ANALISE: 'Em Análise',
    COM_PENDENCIAS: 'Com Pendências',
    EM_FORMALIZACAO: 'Em Formalização',
    AGUARDANDO_CONFIRMACAO: 'Aguardando PNCP',
    CONCLUIDO_INTERNAMENTE: 'Concluído Internamente',
    CONCLUIDO_OFICIALMENTE: 'Concluído Oficialmente',
    CANCELADO: 'Cancelado'
  };

  return {
    id: wf.workflowId,
    kind: 'ENCERRAMENTO',
    tipoNomeAmigavel: 'Encerramento Contratual Regular',
    statusRaw: wf.status,
    statusLabel: statusLabels[wf.status] || wf.status,
    statusVariant,
    isActive,
    isCompleted,
    hasAttention: wf.status === 'COM_PENDENCIAS' || (isClosePlan ? hasPlanAttention(plan) : false),
    etapaAtual,
    progresso: {
      concluidas: concluidasCount,
      total: macroetapas.length,
      percentual: Math.round((concluidasCount / macroetapas.length) * 100)
    },
    macroetapas,
    proximaTarefa: isClosePlan ? findNextPendingTask(plan) : undefined,
    responsavelNome: wf.responsavelNome,
    processoSeiNumero: wf.processoSeiNumero || contract.processo,
    canonicalWorkflow: wf
  };
}

// ----------------------------------------------------------------------------
// 4. Projeção de Extinção Antecipada / Rescisão (Fase 4.4C)
// ----------------------------------------------------------------------------
function projectRescission(
  contract: ContractDashboardRecord,
  plan: ContractTaskPlan
): ContractWorkflowPresentationItem {
  const wf = assembleRescissionWorkflow({
    contract,
    tipoExtincao: 'EXTINCAO_UNILATERAL',
    planTarefas: plan
  });

  const macroetapas: WorkflowMacrostepItem[] = [
    { id: 'macro-resc-1', label: 'Motivação e Contraditório', status: 'FUTURA', ordem: 1 },
    { id: 'macro-resc-2', label: 'Análise Jurídica e Decisão', status: 'FUTURA', ordem: 2 },
    { id: 'macro-resc-3', label: 'Formalização da Rescisão', status: 'FUTURA', ordem: 3 },
    { id: 'macro-resc-4', label: 'Confirmação Oficial no PNCP', status: 'FUTURA', ordem: 4 }
  ];

  let etapaAtual = 'Motivação e Contraditório';
  let statusVariant: ContractWorkflowPresentationItem['statusVariant'] = 'info';

  switch (wf.status) {
    case 'CONCLUIDO_OFICIALMENTE':
      macroetapas.forEach(m => (m.status = 'CONCLUIDA'));
      etapaAtual = 'Rescisão Confirmada Soberanamente';
      statusVariant = 'success';
      break;
    case 'AGUARDANDO_CONFIRMACAO':
      macroetapas[0].status = 'CONCLUIDA';
      macroetapas[1].status = 'CONCLUIDA';
      macroetapas[2].status = 'CONCLUIDA';
      macroetapas[3].status = 'ATUAL';
      etapaAtual = 'Aguardando Confirmação no PNCP';
      statusVariant = 'warning';
      break;
    case 'CONCLUIDO_INTERNAMENTE':
    case 'EM_FORMALIZACAO':
      macroetapas[0].status = 'CONCLUIDA';
      macroetapas[1].status = 'CONCLUIDA';
      macroetapas[2].status = 'ATUAL';
      etapaAtual = 'Formalização do Termo de Rescisão';
      statusVariant = 'info';
      break;
    case 'AGUARDANDO_DECISAO':
      macroetapas[0].status = 'CONCLUIDA';
      macroetapas[1].status = 'ATUAL';
      etapaAtual = 'Aguardando Decisão da Autoridade';
      statusVariant = 'warning';
      break;
    case 'COM_PENDENCIAS':
      macroetapas[0].status = 'ATUAL';
      etapaAtual = 'Pendências de Instrução / Defesa Prévia';
      statusVariant = 'danger';
      break;
    case 'CANCELADO':
      etapaAtual = 'Processo Rescisório Cancelado';
      statusVariant = 'neutral';
      break;
    case 'EM_ANALISE':
    case 'EM_INSTRUCAO':
    case 'NAO_INICIADO':
    default:
      macroetapas[0].status = 'ATUAL';
      etapaAtual = 'Instrução do Processo Rescisório';
      statusVariant = wf.status === 'NAO_INICIADO' ? 'neutral' : 'info';
      break;
  }

  const concluidasCount = macroetapas.filter(m => m.status === 'CONCLUIDA').length;
  const isCompleted = wf.status === 'CONCLUIDO_OFICIALMENTE';
  const isActive = !isCompleted && wf.status !== 'CANCELADO';

  const statusLabels: Record<string, string> = {
    NAO_INICIADO: 'Não Iniciado',
    EM_ANALISE: 'Em Análise',
    COM_PENDENCIAS: 'Com Pendências',
    EM_INSTRUCAO: 'Em Instrução',
    AGUARDANDO_DECISAO: 'Aguardando Decisão',
    EM_FORMALIZACAO: 'Em Formalização',
    AGUARDANDO_CONFIRMACAO: 'Aguardando PNCP',
    CONCLUIDO_INTERNAMENTE: 'Concluído Internamente',
    CONCLUIDO_OFICIALMENTE: 'Concluído Oficialmente',
    CANCELADO: 'Cancelado'
  };

  return {
    id: wf.workflowId,
    kind: 'EXTINCAO',
    tipoNomeAmigavel: 'Extinção Antecipada / Rescisão Unilateral',
    statusRaw: wf.status,
    statusLabel: statusLabels[wf.status] || wf.status,
    statusVariant,
    isActive,
    isCompleted,
    hasAttention: wf.status === 'COM_PENDENCIAS' || hasPlanAttention(plan),
    etapaAtual,
    progresso: {
      concluidas: concluidasCount,
      total: macroetapas.length,
      percentual: Math.round((concluidasCount / macroetapas.length) * 100)
    },
    macroetapas,
    proximaTarefa: findNextPendingTask(plan),
    responsavelNome: wf.responsavelNome,
    processoSeiNumero: wf.processoSeiNumero || contract.processo,
    canonicalWorkflow: wf
  };
}

// ============================================================================
// FUNÇÃO PURA DE PROJEÇÃO DE WORKFLOWS (TESTÁVEL E DETERMINÍSTICA)
// ============================================================================

export function projectContractWorkflows(
  contract?: ContractDashboardRecord | null,
  plan?: ContractTaskPlan | null
): ContractWorkflowPresentationItem[] {
  if (!contract) return [];

  const list: ContractWorkflowPresentationItem[] = [];

  // 1. Identificar se o plano aplicado é específico
  const tplId = plan?.templateId || '';
  const tplNome = (plan?.templateNome || '').toLowerCase();

  const isProrrPlan =
    tplId === 'tpl-prorrogacao-padrao-14133' || tplNome.includes('prorroga');
  const isAmendmentPlan =
    tplId.includes('acrescimo') ||
    tplId.includes('supressao') ||
    tplId.includes('reajuste') ||
    tplId.includes('repactuacao') ||
    tplId.includes('apostilamento') ||
    tplId.includes('qualitativa') ||
    tplNome.includes('aditivo') ||
    tplNome.includes('apostilamento') ||
    tplNome.includes('altera') ||
    tplNome.includes('acréscimo') ||
    tplNome.includes('supressão') ||
    tplNome.includes('reajuste');
  const isClosurePlan =
    tplId === 'tpl-encerramento-condicional-14133' || tplNome.includes('encerra');
  const isRescissionPlan =
    tplId === 'tpl-rescisao-padrao-14133' ||
    tplNome.includes('rescis') ||
    tplNome.includes('extin');

  // 2. Critérios de Elegibilidade de Prorrogação
  const deadlines = calculateProrrogationDeadlines(contract.dataVigenciaFim || '');
  const isWithinProrrogationWindow =
    Boolean(deadlines && deadlines.diasRestantesVigencia <= 180 && deadlines.diasRestantesVigencia >= -30);
  const isNotTerminated = contract.statusVigencia !== 'Expirado';

  if (isProrrPlan || (isWithinProrrogationWindow && isNotTerminated)) {
    list.push(projectProrrogation(contract, plan));
  }

  // 3. Critérios de Elegibilidade de Alteração/Apostilamento
  if (isAmendmentPlan && plan) {
    list.push(projectAmendment(contract, plan));
  }

  // 4. Critérios de Elegibilidade de Encerramento Regular
  const isContractExpired = contract.statusVigencia === 'Expirado';
  if (isClosurePlan || (isContractExpired && !isRescissionPlan)) {
    list.push(projectClosure(contract, plan));
  }

  // 5. Critérios de Elegibilidade de Extinção Antecipada / Rescisão
  if (isRescissionPlan && plan) {
    list.push(projectRescission(contract, plan));
  }

  // 6. Ordenação Determinística (Regra 11):
  // 1. Ativos com plano e tarefas vencidas/atenção no plano (Score 5)
  // 2. Ativos com atenção geral (Score 4)
  // 3. Ativos sem atenção (Score 3)
  // 4. Concluídos recentemente (Score 2)
  // 5. Demais (Score 1)
  return list.sort((a, b) => {
    const getScore = (item: ContractWorkflowPresentationItem) => {
      const isTaskOverdue = item.proximaTarefa?.atencaoNivel === 'VENCIDA';
      if (item.isActive && item.hasAttention && isTaskOverdue) return 5;
      if (item.isActive && item.hasAttention) return 4;
      if (item.isActive) return 3;
      if (item.isCompleted) return 2;
      return 1;
    };
    return getScore(b) - getScore(a);
  });
}

// ============================================================================
// HOOK PRINCIPAL
// ============================================================================

export function useContractWorkflows(
  contract?: ContractDashboardRecord | null,
  planOverride?: ContractTaskPlan | null
): UseContractWorkflowsResult {
  const contractKey = contract?.id || '';
  const shouldFetchPlan = Boolean(contractKey) && planOverride === undefined;

  const {
    data: fetchedPlan,
    isLoading: isPlanLoading,
    error: planError
  } = useContractTaskPlan(contractKey, shouldFetchPlan);

  const plan = planOverride !== undefined ? planOverride : fetchedPlan;

  const workflows = useMemo<ContractWorkflowPresentationItem[]>(
    () => projectContractWorkflows(contract, plan),
    [contract, plan]
  );

  const activeCount = workflows.filter(w => w.isActive).length;
  const completedCount = workflows.filter(w => w.isCompleted).length;

  return {
    workflows,
    activeCount,
    completedCount,
    isLoading: shouldFetchPlan ? isPlanLoading : false,
    error: planError || null
  };
}
