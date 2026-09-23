/**
 * Serviço de Gestão do Workflow Operacional de Extinção Antecipada / Rescisão Contratual (SaldoARP — Fase 4.4C)
 *
 * Princípios Fundamentais:
 * 1. FATO/MOTIVO → INSTRUÇÃO INTERNA → DECISÃO/FORMALIZAÇÃO → CONFIRMAÇÃO OFICIAL → EVENTO OFICIAL SOBERANO
 * 2. CONCLUSÃO INTERNA ≠ EXTINÇÃO OFICIAL SOBERANA: Decisões internas e termos lavrados não alteram o estado canônico oficial até confirmação no PNCP/Contratos.gov.br.
 * 3. PRINCÍPIO "DIGITE UMA VEZ, USE EM TODO LUGAR": Tarefas são dinâmicas e condicionais; não cria tarefas redundantes para dados/processos já existentes.
 * 4. SEMÂNTICA DE EXECUÇÃO (Fase 4.3C): Todas as tarefas possuem TaskExecutionMode (INTERNA, EXTERNA, CONFIRMACAO).
 */

import type {
  ContractRescissionWorkflow,
  ContractRescissionWorkflowStatus,
  RescissionDecisionRecord,
  RescissionFormalizationRecord,
  RescissionOfficialConfirmation
} from '../types/contractRescissionWorkflows';
import type {
  ContractExtinctionType,
  ContractClosureChecklist,
  ExtinctionMotivation
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
  evaluateExtinctionReadiness,
  buildContractExtinctionDomain,
  buildExtinctionContractEvent
} from './contractExtinctionService';

/**
 * 1. Gera chave lógica determinística e canônica para o Workflow de Extinção / Rescisão.
 * Formato: WF::EXTINCAO::{contractKey}::{tipoExtincao}::{cycleRef}{::identificador}
 */
export function generateRescissionWorkflowId(
  contractKey: string,
  tipoExtincao: ContractExtinctionType,
  cycleRef: string,
  identificador?: string
): string {
  const sanitize = (s: string) => s.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').toUpperCase();
  const idSuffix = identificador ? `::${sanitize(identificador)}` : '';
  return `WF::EXTINCAO::${sanitize(contractKey)}::${sanitize(tipoExtincao)}::${sanitize(cycleRef)}${idSuffix}`;
}

export const generateExtinctionWorkflowId = generateRescissionWorkflowId;

/**
 * 2. Constrói Template Dinâmico e Condicional de Extinção Antecipada / Rescisão.
 * Gera somente as tarefas estritamente necessárias de acordo com a modalidade jurídica e pendências reais.
 */
export function buildConditionalRescissionTemplate(params: {
  tipoExtincao: ContractExtinctionType;
  motivacao?: ExtinctionMotivation;
  checklist?: ContractClosureChecklist;
  decisao?: RescissionDecisionRecord;
  formalizacao?: RescissionFormalizationRecord;
  confirmacaoOficial?: RescissionOfficialConfirmation;
}): ContractTaskTemplate {
  const { tipoExtincao, motivacao = {}, checklist = {}, decisao = {}, formalizacao = {}, confirmacaoOficial } = params;
  const macrotarefas: ContractTaskTemplateMacrotask[] = [];
  let macroOrder = 1;
  let taskOrder = 1;

  // -------------------------------------------------------------
  // Macro 1: Instrução e Procedimento Preliminar
  // -------------------------------------------------------------
  const instrucaoTasks: ContractTaskTemplateTask[] = [];

  // A) Processo SEI
  if (!motivacao.processoSeiNumero) {
    instrucaoTasks.push({
      id: 'task-resc-sei',
      macrotaskId: 'macro-resc-instrucao',
      nome: 'Autuar processo administrativo de extinção contratual no SEI',
      ordem: taskOrder++,
      executionMode: 'INTERNA',
      sistemaDestino: 'SEI'
    });
  }

  // B) Contraditório e Ampla Defesa (específico para Unilateral)
  if (tipoExtincao === 'EXTINCAO_UNILATERAL' && !motivacao.contraditorioAmplaDefesaAssegurado) {
    instrucaoTasks.push({
      id: 'task-resc-contraditorio',
      macrotaskId: 'macro-resc-instrucao',
      nome: 'Notificar contratada para apresentação de defesa prévia (contraditório / art. 137)',
      ordem: taskOrder++,
      executionMode: 'INTERNA',
      sistemaDestino: 'SEI'
    });
  }

  // C) Parecer Jurídico (se não emitido)
  if (tipoExtincao === 'EXTINCAO_UNILATERAL' && !motivacao.parecerJuridicoNumero && !decisao.parecerJuridicoNumero) {
    instrucaoTasks.push({
      id: 'task-resc-parecer-juridico',
      macrotaskId: 'macro-resc-instrucao',
      nome: 'Submeter instrução processual para emissão de Parecer Jurídico conclusivo',
      ordem: taskOrder++,
      executionMode: 'INTERNA',
      sistemaDestino: 'SEI / Consultoria Jurídica'
    });
  }

  // D) Minuta de Distrato (específico para Consensual)
  if (tipoExtincao === 'EXTINCAO_CONSENSUAL' && !formalizacao.numeroTermo) {
    instrucaoTasks.push({
      id: 'task-resc-minuta-distrato',
      macrotaskId: 'macro-resc-instrucao',
      nome: 'Elaborar minuta do Termo de Distrato Bilateral e colher anuência das partes',
      ordem: taskOrder++,
      executionMode: 'INTERNA',
      sistemaDestino: 'SEI'
    });
  }

  // E) Juntada de Sentença / Laudo (específico para Judicial/Arbitral)
  if (tipoExtincao === 'EXTINCAO_JUDICIAL_ARBITRAL' && !motivacao.documentoSeiComprobatorio) {
    instrucaoTasks.push({
      id: 'task-resc-sentenca-judicial',
      macrotaskId: 'macro-resc-instrucao',
      nome: 'Juntar aos autos a sentença judicial / laudo arbitral e certidão de trânsito em julgado',
      ordem: taskOrder++,
      executionMode: 'INTERNA',
      sistemaDestino: 'SEI'
    });
  }

  // F) Apuração de Liquidações e Encerramento Financeiro
  if (
    checklist.pagamentosPendentes ||
    checklist.pendenciasExecucaoIdentificadas ||
    (checklist.saldoFinanceiroRemanescente !== undefined && checklist.saldoFinanceiroRemanescente > 0)
  ) {
    instrucaoTasks.push({
      id: 'task-resc-apuracao-financeira',
      macrotaskId: 'macro-resc-instrucao',
      nome: 'Apurar medição/entregas finais, liquidar haveres e calcular saldo remanescente de empenho',
      ordem: taskOrder++,
      executionMode: 'INTERNA',
      sistemaDestino: 'SIAFI / SEI'
    });
  }

  // G) Liberação ou Execução de Garantia
  if (checklist.garantiaExigida && !checklist.garantiaLiberada) {
    instrucaoTasks.push({
      id: 'task-resc-garantia',
      macrotaskId: 'macro-resc-instrucao',
      nome: 'Instruir destinação da garantia contratual (liberação ou execução para amortização de prejuízos)',
      ordem: taskOrder++,
      executionMode: 'INTERNA',
      sistemaDestino: 'SEI'
    });
  }

  if (instrucaoTasks.length > 0) {
    macrotarefas.push({
      id: 'macro-resc-instrucao',
      templateId: 'tpl-rescisao-condicional-14133',
      nome: `${macroOrder++}. Instrução e Regularização Preliminar`,
      ordem: macrotarefas.length + 1,
      tarefas: instrucaoTasks
    });
  }

  // -------------------------------------------------------------
  // Macro 2: Decisão Administrativa e Formalização do Ato
  // -------------------------------------------------------------
  const formalizacaoTasks: ContractTaskTemplateTask[] = [];

  // A) Decisão da Autoridade Competente
  if (decisao.status !== 'APROVADO' && !decisao.decididoEm) {
    formalizacaoTasks.push({
      id: 'task-resc-decisao-autoridade',
      macrotaskId: 'macro-resc-formalizacao',
      nome: 'Submeter despacho decisório de rescisão à autoridade competente para assinatura',
      ordem: taskOrder++,
      executionMode: 'INTERNA',
      sistemaDestino: 'SEI'
    });
  }

  // B) Lavratura do Termo no Sistema Oficial
  if (!formalizacao.numeroTermo || !formalizacao.dataAssinatura) {
    formalizacaoTasks.push({
      id: 'task-resc-lavrar-termo',
      macrotaskId: 'macro-resc-formalizacao',
      nome: 'Lavrar e assinar o Termo de Rescisão / Distrato no sistema oficial',
      ordem: taskOrder++,
      executionMode: 'EXTERNA',
      sistemaDestino: 'Contratos.gov.br / SEI'
    });
  }

  // C) Publicação Oficial
  if (!formalizacao.dataPublicacao && !formalizacao.numeroPublicacaoPncpDoi) {
    formalizacaoTasks.push({
      id: 'task-resc-publicar-pncp',
      macrotaskId: 'macro-resc-formalizacao',
      nome: 'Publicar o ato de extinção/rescisão no PNCP / Diário Oficial (art. 94 Lei 14.133/21)',
      ordem: taskOrder++,
      executionMode: 'EXTERNA',
      sistemaDestino: 'PNCP / DOU'
    });
  }

  if (formalizacaoTasks.length > 0) {
    macrotarefas.push({
      id: 'macro-resc-formalizacao',
      templateId: 'tpl-rescisao-condicional-14133',
      nome: `${macroOrder++}. Decisão e Formalização do Ato`,
      ordem: macrotarefas.length + 1,
      tarefas: formalizacaoTasks
    });
  }

  // -------------------------------------------------------------
  // Macro 3: Confirmação Oficial Soberana
  // -------------------------------------------------------------
  if (!confirmacaoOficial?.confirmado) {
    macrotarefas.push({
      id: 'macro-resc-confirmacao',
      templateId: 'tpl-rescisao-condicional-14133',
      nome: `${macroOrder++}. Confirmação Oficial Soberana`,
      ordem: macrotarefas.length + 1,
      tarefas: [
        {
          id: 'task-resc-confirmar-pncp',
          macrotaskId: 'macro-resc-confirmacao',
          nome: 'Aguardar confirmação oficial da rescisão contratual pela API do PNCP / Contratos.gov.br',
          ordem: taskOrder++,
          executionMode: 'CONFIRMACAO',
          sistemaDestino: 'PNCP'
        }
      ]
    });
  }

  return {
    id: 'tpl-rescisao-condicional-14133',
    nome: 'Workflow Condicional de Extinção Antecipada / Rescisão (Lei 14.133/21)',
    descricao: 'Roteiro dinâmico ajustado à modalidade de rescisão e aos atos administrativos efetivamente pendentes.',
    ativo: true,
    createdAt: '2026-09-23T00:00:00Z',
    updatedAt: '2026-09-23T00:00:00Z',
    macrotarefas
  };
}

/**
 * 3. Deriva o Estado Operacional do Workflow de Extinção Antecipada / Rescisão.
 * Princípio: Conclusão Interna ≠ Extinção Oficial Soberana.
 */
export function deriveRescissionWorkflowStatus(params: {
  contract: ContractDashboardRecord;
  workflow: Partial<ContractRescissionWorkflow>;
  planTarefas?: ContractTaskPlan | null;
}): ContractRescissionWorkflowStatus {
  const { workflow } = params;

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
    workflow.status === 'CONCLUIDO_INTERNAMENTE' ||
    (workflow.decisao?.status === 'APROVADO' &&
      (workflow.formalizacao?.numeroTermo || workflow.formalizacao?.dataAssinatura))
  ) {
    return 'CONCLUIDO_INTERNAMENTE';
  }
  if (
    workflow.status === 'EM_FORMALIZACAO' ||
    workflow.decisao?.status === 'APROVADO' ||
    workflow.formalizacao?.dataAssinatura
  ) {
    return 'EM_FORMALIZACAO';
  }
  if (
    workflow.status === 'AGUARDANDO_DECISAO' ||
    workflow.decisao?.status === 'PENDENTE' ||
    workflow.motivacao?.parecerJuridicoNumero
  ) {
    return 'AGUARDANDO_DECISAO';
  }

  const tipoExtincao = workflow.tipoExtincao || 'EXTINCAO_UNILATERAL';
  const readiness = evaluateExtinctionReadiness({
    tipoExtincao,
    motivacao: workflow.motivacao,
    checklist: workflow.checklist
  });

  if (readiness.status === 'INFORMACOES_INSUFICIENTES' || readiness.status === 'PENDENCIAS_IMPEDITIVAS') {
    if (workflow.motivacao?.descricaoMotivo || workflow.processoSeiNumero) {
      return 'COM_PENDENCIAS';
    }
  }

  if (workflow.dataInicio || workflow.processoSeiNumero || workflow.motivacao?.descricaoMotivo || workflow.status === 'EM_INSTRUCAO') {
    return 'EM_INSTRUCAO';
  }

  if (workflow.status === 'EM_ANALISE') {
    return 'EM_ANALISE';
  }

  return 'NAO_INICIADO';
}

/**
 * 4. Montagem Integrada do Workflow Operacional de Extinção Antecipada / Rescisão.
 */
export function assembleRescissionWorkflow(params: {
  contract: ContractDashboardRecord;
  tipoExtincao: ContractExtinctionType;
  motivacao?: ExtinctionMotivation;
  checklist?: ContractClosureChecklist;
  decisao?: RescissionDecisionRecord;
  formalizacao?: RescissionFormalizationRecord;
  confirmacaoOficial?: RescissionOfficialConfirmation;
  planTarefas?: ContractTaskPlan | null;
  processoSeiId?: string;
  processoSeiNumero?: string;
  responsavelNome?: string;
  statusOverride?: ContractRescissionWorkflowStatus;
  identificador?: string;
  observacoes?: string;
}): ContractRescissionWorkflow {
  const {
    contract,
    tipoExtincao,
    motivacao = {},
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

  const workflowId = generateRescissionWorkflowId(contractKey, tipoExtincao, cycleRef, identificador);

  const partialWf: Partial<ContractRescissionWorkflow> = {
    tipoExtincao,
    motivacao,
    checklist,
    decisao,
    formalizacao,
    confirmacaoOficial,
    dataInicio: contract.dataVigenciaInicio,
    processoSeiNumero: processoSeiNumero || motivacao.processoSeiNumero || contract.processo
  };

  const status = statusOverride || deriveRescissionWorkflowStatus({ contract, workflow: partialWf, planTarefas });

  const oficialidade: AmendmentOfficialityClassification = {
    nivelOficialidade: confirmacaoOficial.confirmado
      ? 'FATO_OFICIAL'
      : (formalizacao.dataPublicacao || formalizacao.numeroPublicacaoPncpDoi
          ? 'DECISAO_INTERNA'
          : (decisao.status === 'APROVADO' ? 'DECISAO_INTERNA' : 'PROPOSTA_ADMINISTRATIVA')),
    fonte: confirmacaoOficial.confirmado ? (confirmacaoOficial.fonteOficial || 'PNCP') : (contract.fonteDados || 'SaldoARP'),
    dataPublicacaoOficial: formalizacao.dataPublicacao,
    numeroPublicacaoOficial: formalizacao.numeroPublicacaoPncpDoi || confirmacaoOficial.numeroControlePncp,
    isFatoSoberano: Boolean(confirmacaoOficial.confirmado),
    explicabilidade: confirmacaoOficial.confirmado
      ? `Extinção/Rescisão contratual confirmada oficialmente pela fonte soberana (${confirmacaoOficial.fonteOficial || 'PNCP'}).`
      : 'Processo administrativo de rescisão/extinção em instrução no SaldoARP.'
  };

  return {
    workflowId,
    contractKey,
    uasg: contract.uasg,
    numeroContrato: contract.numero,
    anoContrato,
    cycleRef,
    tipoExtincao,
    status,
    dataInicio: contract.dataVigenciaInicio,
    responsavelNome,
    processoSeiId,
    processoSeiNumero: processoSeiNumero || motivacao.processoSeiNumero || contract.processo,
    motivacao,
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
 * 5. Confirmação Oficial Soberana de Extinção Antecipada / Rescisão.
 * Transiciona o workflow para 'CONCLUIDO_OFICIALMENTE', emite o `ContractEvent` formal com impacto 'EXTINGUE_CONTRATO'
 * e deriva a projeção atualizada do contrato.
 */
export function confirmRescissionWorkflowOfficially(params: {
  workflow: ContractRescissionWorkflow;
  contract: ContractDashboardRecord;
  fonteOficial: string;
  dataConfirmacao?: string;
  numeroControlePncp?: string;
  dataEfeitoOficial?: string;
  linkPncp?: string;
}): {
  updatedWorkflow: ContractRescissionWorkflow;
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

  const confirmacaoOficial: RescissionOfficialConfirmation = {
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
    explicabilidade: `Rescisão/Extinção contratual confirmada soberanamente por ${fonteOficial}.`
  };

  const updatedWorkflow: ContractRescissionWorkflow = {
    ...workflow,
    status: 'CONCLUIDO_OFICIALMENTE',
    oficialidade: updatedOficialidade,
    confirmacaoOficial
  };

  const domain = buildContractExtinctionDomain({
    contract,
    tipoExtincao: workflow.tipoExtincao,
    instrumentoFormal: workflow.formalizacao.instrumentoFormal || (workflow.tipoExtincao === 'EXTINCAO_UNILATERAL' ? 'ATO_UNILATERAL' : 'INSTRUMENTO_CONSENSUAL'),
    identificadorInstrumento: workflow.formalizacao.numeroTermo || 'Termo Rescisório',
    dataEfeitoExtincao: dataEfeitoOficial,
    checklist: workflow.checklist,
    motivacao: workflow.motivacao,
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
