/**
 * Serviço de Gestão do Workflow Operacional de Encerramento Contratual Regular (SaldoARP — Fase 4.4B)
 *
 * Princípios Fundamentais:
 * 1. FIM DA VIGÊNCIA ≠ ENCERRAMENTO OPERACIONAL ≠ EXTINÇÃO CONTRATUAL ≠ FATO OFICIAL CONFIRMADO
 * 2. PRINCÍPIO "DIGITE UMA VEZ, USE EM TODO LUGAR": Gestão de pendências e contexto no SaldoARP; fatos oficiais nas APIs.
 * 3. TEMPLATE CONDICIONAL: Apenas tarefas para pendências reais e aplicáveis (não cria tarefas artificiais).
 * 4. CONCLUSÃO INTERNA ≠ ENCERRAMENTO OFICIAL SOBERANO.
 */

import type {
  ContractClosureWorkflow,
  ContractClosureWorkflowStatus,
  ClosureDecisionRecord,
  ClosureFormalizationRecord,
  ClosureOfficialConfirmation
} from '../types/contractClosureWorkflows';
import type {
  ContractClosureChecklist
} from '../types/contractExtinctions';
import type {
  ContractDashboardRecord,
  ContractTaskTemplate,
  ContractTaskPlan,
  ContractEvent,
  ContractTaskTemplateTask,
  ContractTaskTemplateMacrotask
} from '../types';
import type { AmendmentOfficialityClassification } from '../types/contractAmendments';
import {
  evaluateContractClosureReadiness,
  buildContractExtinctionDomain,
  buildExtinctionContractEvent
} from './contractExtinctionService';

/**
 * 1. Gera chave lógica determinística e canônica para o Workflow de Encerramento.
 * Formato: WF::ENCERRAMENTO::{contractKey}::{cycleRef}{::identificador}
 */
export function generateClosureWorkflowId(
  contractKey: string,
  cycleRef: string,
  identificador?: string
): string {
  const sanitize = (s: string) => s.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').toUpperCase();
  const idSuffix = identificador ? `::${sanitize(identificador)}` : '';
  return `WF::ENCERRAMENTO::${sanitize(contractKey)}::${sanitize(cycleRef)}${idSuffix}`;
}

/**
 * 2. Constrói Template Dinâmico e Condicional de Encerramento Regular.
 * Cria somente as tarefas estritamente aplicáveis às pendências reais identificadas no checklist.
 */
export function buildConditionalClosureTemplate(checklist: ContractClosureChecklist = {}): ContractTaskTemplate {
  const pendenciasTasks: ContractTaskTemplateTask[] = [];
  let taskOrder = 1;

  // 1. Recebimento Definitivo (apenas se não houver atesto/TRD confirmado)
  if (checklist.objetoRecebidoDefinitivo === false && !checklist.termoRecebimentoDefinitivoSei) {
    pendenciasTasks.push({
      id: 'task-close-trd',
      macrotaskId: 'macro-close-pendencias',
      nome: 'Obter e formalizar o Termo de Recebimento Definitivo (TRD) no SEI',
      ordem: taskOrder++,
      executionMode: 'INTERNA',
      sistemaDestino: 'SEI'
    });
  }

  // 2. Liquidação e Estorno Financeiro (apenas se houver pagamentos ou saldo de empenho pendente)
  if (
    checklist.pagamentosPendentes ||
    (checklist.saldoFinanceiroRemanescente !== undefined && checklist.saldoFinanceiroRemanescente > 0 && !checklist.empenhosRemanescentesParaEstorno)
  ) {
    pendenciasTasks.push({
      id: 'task-close-fin',
      macrotaskId: 'macro-close-pendencias',
      nome: 'Liquidar pagamentos pendentes e providenciar estorno de saldo de empenho remanescente',
      ordem: taskOrder++,
      executionMode: 'INTERNA',
      sistemaDestino: 'SIAFI / SEI'
    });
  }

  // 3. Liberação de Garantia (apenas se garantia exigida e ainda retida)
  if (checklist.garantiaExigida && !checklist.garantiaLiberada) {
    pendenciasTasks.push({
      id: 'task-close-garantia',
      macrotaskId: 'macro-close-pendencias',
      nome: 'Expedir termo de liberação e restituição da garantia contratual',
      ordem: taskOrder++,
      executionMode: 'INTERNA',
      sistemaDestino: 'SEI'
    });
  }

  // 4. Regularidade Trabalhista / Fiscal (apenas se houver pendências assinaladas)
  if (checklist.pendenciasTrabalhistasFiscais) {
    pendenciasTasks.push({
      id: 'task-close-fiscal',
      macrotaskId: 'macro-close-pendencias',
      nome: 'Verificar regularidade fiscal e trabalhista final no SICAF',
      ordem: taskOrder++,
      executionMode: 'EXTERNA',
      sistemaDestino: 'SICAF / Compras.gov.br'
    });
  }

  const macrotarefas: ContractTaskTemplateMacrotask[] = [];
  let macroOrder = 1;

  // Macro 1: Regularização de Pendências (apenas se existirem pendências reais)
  if (pendenciasTasks.length > 0) {
    macrotarefas.push({
      id: 'macro-close-pendencias',
      templateId: 'tpl-encerramento-condicional-14133',
      nome: '1. Regularização de Pendências Finais',
      ordem: macroOrder++,
      tarefas: pendenciasTasks
    });
  }

  // Macro 2: Formalização do Encerramento
  macrotarefas.push({
    id: 'macro-close-formalizacao',
    templateId: 'tpl-encerramento-condicional-14133',
    nome: pendenciasTasks.length > 0 ? '2. Formalização do Encerramento' : '1. Formalização do Encerramento',
    ordem: macroOrder++,
    tarefas: [
      {
        id: 'task-close-formalizar',
        macrotaskId: 'macro-close-formalizacao',
        nome: 'Formalizar encerramento do contrato no sistema oficial',
        ordem: taskOrder++,
        executionMode: 'EXTERNA',
        sistemaDestino: 'Contratos.gov.br / PNCP'
      }
    ]
  });

  // Macro 3: Confirmação Oficial Soberana
  macrotarefas.push({
    id: 'macro-close-confirmacao',
    templateId: 'tpl-encerramento-condicional-14133',
    nome: pendenciasTasks.length > 0 ? '3. Confirmação Oficial' : '2. Confirmação Oficial',
    ordem: macroOrder++,
    tarefas: [
      {
        id: 'task-close-confirmar',
        macrotaskId: 'macro-close-confirmacao',
        nome: 'Aguardar confirmação oficial da publicação do encerramento no PNCP',
        ordem: taskOrder++,
        executionMode: 'CONFIRMACAO',
        sistemaDestino: 'PNCP'
      }
    ]
  });

  return {
    id: 'tpl-encerramento-condicional-14133',
    nome: 'Workflow Condicional de Encerramento Regular (Lei 14.133/21)',
    descricao: 'Roteiro dinâmico e enxuto adaptado às pendências reais de encerramento do contrato.',
    ativo: true,
    createdAt: '2026-09-23T00:00:00Z',
    updatedAt: '2026-09-23T00:00:00Z',
    macrotarefas
  };
}

/**
 * 3. Deriva o Estado Operacional do Workflow de Encerramento.
 * Princípio: Conclusão Interna ≠ Encerramento Oficial Soberano.
 */
export function deriveClosureWorkflowStatus(params: {
  contract: ContractDashboardRecord;
  workflow: Partial<ContractClosureWorkflow>;
  planTarefas?: ContractTaskPlan | null;
}): ContractClosureWorkflowStatus {
  const { contract, workflow } = params;

  if (workflow.status === 'CANCELADO') return 'CANCELADO';
  if (workflow.confirmacaoOficial?.confirmado || workflow.status === 'CONCLUIDO_OFICIALMENTE') {
    return 'CONCLUIDO_OFICIALMENTE';
  }
  if (
    workflow.formalizacao?.numeroPublicacaoPncpDoi ||
    workflow.formalizacao?.dataPublicacao ||
    workflow.status === 'AGUARDANDO_CONFIRMACAO'
  ) {
    return 'AGUARDANDO_CONFIRMACAO';
  }
  if (
    workflow.decisao?.status === 'CONCLUIDO_INTERNAMENTE' ||
    workflow.status === 'CONCLUIDO_INTERNAMENTE'
  ) {
    return 'CONCLUIDO_INTERNAMENTE';
  }
  if (workflow.formalizacao?.dataAssinatura || workflow.status === 'EM_FORMALIZACAO') {
    return 'EM_FORMALIZACAO';
  }

  const readiness = evaluateContractClosureReadiness(workflow.checklist || {}, contract.statusVigencia === 'Expirado');
  if (readiness.status === 'PENDENCIAS_IMPEDITIVAS') {
    return 'COM_PENDENCIAS';
  }

  if (workflow.dataInicio || contract.statusVigencia === 'Expirado' || workflow.status === 'EM_ANALISE') {
    return 'EM_ANALISE';
  }

  return 'NAO_INICIADO';
}

/**
 * 4. Montagem Integrada do Workflow Operacional de Encerramento Regular.
 */
export function assembleClosureWorkflow(params: {
  contract: ContractDashboardRecord;
  checklist?: ContractClosureChecklist;
  decisao?: ClosureDecisionRecord;
  formalizacao?: ClosureFormalizationRecord;
  confirmacaoOficial?: ClosureOfficialConfirmation;
  planTarefas?: ContractTaskPlan | null;
  processoSeiId?: string;
  processoSeiNumero?: string;
  responsavelNome?: string;
  statusOverride?: ContractClosureWorkflowStatus;
  identificador?: string;
  observacoes?: string;
}): ContractClosureWorkflow {
  const {
    contract,
    checklist = {},
    decisao = {},
    formalizacao = {},
    confirmacaoOficial = { confirmado: false },
    planTarefas,
    processoSeiId,
    processoSeiNumero,
    responsavelNome,
    statusOverride,
    identificador,
    observacoes
  } = params;

  const contractKey = contract.id;
  const anoContrato = typeof contract.ano === 'number' ? contract.ano : (parseInt(String(contract.ano), 10) || 2026);
  const dataVigenciaAtual = contract.dataVigenciaFim || 'Não Informado';
  const cycleRef = `VIG_${dataVigenciaAtual.replace(/\D/g, '') || 'INICIAL'}`;

  const workflowId = generateClosureWorkflowId(contractKey, cycleRef, identificador);

  const partialWf: Partial<ContractClosureWorkflow> = {
    checklist,
    decisao,
    formalizacao,
    confirmacaoOficial,
    dataInicio: contract.dataVigenciaInicio
  };

  const status = statusOverride || deriveClosureWorkflowStatus({ contract, workflow: partialWf, planTarefas });

  const oficialidade: AmendmentOfficialityClassification = {
    nivelOficialidade: confirmacaoOficial.confirmado
      ? 'FATO_OFICIAL'
      : (formalizacao.dataPublicacao || formalizacao.numeroPublicacaoPncpDoi
          ? 'DECISAO_INTERNA'
          : (decisao.status === 'CONCLUIDO_INTERNAMENTE' ? 'DECISAO_INTERNA' : 'PROPOSTA_ADMINISTRATIVA')),
    fonte: confirmacaoOficial.confirmado ? (confirmacaoOficial.fonteOficial || 'PNCP') : (contract.fonteDados || 'SaldoARP'),
    dataPublicacaoOficial: formalizacao.dataPublicacao,
    numeroPublicacaoOficial: formalizacao.numeroPublicacaoPncpDoi || confirmacaoOficial.numeroControlePncp,
    isFatoSoberano: Boolean(confirmacaoOficial.confirmado),
    explicabilidade: confirmacaoOficial.confirmado
      ? `Encerramento confirmado oficialmente pela fonte soberana (${confirmacaoOficial.fonteOficial || 'PNCP'}).`
      : 'Processo operacional de encerramento em andamento no SaldoARP.'
  };

  return {
    workflowId,
    contractKey,
    uasg: contract.uasg,
    numeroContrato: contract.numero,
    anoContrato,
    cycleRef,
    status,
    dataInicio: contract.dataVigenciaInicio,
    responsavelNome,
    processoSeiId,
    processoSeiNumero: processoSeiNumero || contract.processo,
    checklist,
    oficialidade,
    decisao,
    formalizacao,
    confirmacaoOficial,
    planTarefas: planTarefas || undefined,
    observacoes
  };
}

/**
 * 5. Confirmação Oficial Soberana de Encerramento Regular.
 * Transiciona o workflow para 'CONCLUIDO_OFICIALMENTE', emite o `ContractEvent` formal com impacto 'EXTINGUE_CONTRATO'
 * e deriva a projeção atualizada do contrato.
 */
export function confirmClosureWorkflowOfficially(params: {
  workflow: ContractClosureWorkflow;
  contract: ContractDashboardRecord;
  fonteOficial: string;
  dataConfirmacao?: string;
  numeroControlePncp?: string;
  dataEfeitoOficial?: string;
  linkPncp?: string;
}): {
  updatedWorkflow: ContractClosureWorkflow;
  updatedContract: ContractDashboardRecord;
  event: ContractEvent;
} {
  const {
    workflow,
    contract,
    fonteOficial,
    dataConfirmacao = new Date().toISOString(),
    numeroControlePncp,
    dataEfeitoOficial = contract.dataVigenciaFim,
    linkPncp
  } = params;

  const confirmacaoOficial: ClosureOfficialConfirmation = {
    confirmado: true,
    fonteOficial,
    dataConfirmacao,
    numeroControlePncp,
    dataEfeitoOficial
  };

  const updatedOficialidade: AmendmentOfficialityClassification = {
    nivelOficialidade: 'FATO_OFICIAL',
    fonte: fonteOficial,
    dataPublicacaoOficial: workflow.formalizacao.dataPublicacao || dataConfirmacao.split('T')[0],
    numeroPublicacaoOficial: numeroControlePncp || workflow.formalizacao.numeroPublicacaoPncpDoi,
    isFatoSoberano: true,
    explicabilidade: `Encerramento regular confirmado soberanamente por ${fonteOficial}.`
  };

  const updatedWorkflow: ContractClosureWorkflow = {
    ...workflow,
    status: 'CONCLUIDO_OFICIALMENTE',
    oficialidade: updatedOficialidade,
    confirmacaoOficial
  };

  const domain = buildContractExtinctionDomain({
    contract,
    tipoExtincao: 'EXTINCAO_ORDINARIA',
    instrumentoFormal: workflow.formalizacao.instrumentoFormal || 'TERMO_RECEBIMENTO_DEFINITIVO',
    identificadorInstrumento: workflow.formalizacao.numeroTermo || 'TRD',
    dataEfeitoExtincao: dataEfeitoOficial,
    checklist: workflow.checklist,
    oficialidade: updatedOficialidade,
    processoSeiId: workflow.processoSeiId,
    processoSeiNumero: workflow.processoSeiNumero,
    linkPncp: linkPncp || workflow.formalizacao.linkPncp
  });

  const event = buildExtinctionContractEvent(domain);

  const updatedContract: ContractDashboardRecord = {
    ...contract,
    statusVigencia: 'Expirado',
    lastSyncedAt: new Date().toISOString()
  };

  return {
    updatedWorkflow,
    updatedContract,
    event
  };
}
