/**
 * Serviço de Gestão do Workflow de Prorrogação Contratual (SaldoARP — Fase 4.2)
 *
 * Funções Puras e Determinísticas:
 * 1. Identidade Canônica de Workflow de Prorrogação (Idempotência por Ciclo);
 * 2. Cálculo do Cronograma Operacional e Prazos (-180d, -120d, 10d úteis, -90d, -60d, -15d);
 * 3. Catálogo do Template Padrão de Tarefas de Prorrogação (Lei 14.133/2021);
 * 4. Avaliação Assistida de Prontidão e Conformidade Legal;
 * 5. Derivação do Estado Operacional do Workflow;
 * 6. Montagem Integrada do Workflow e Transição Determinística de Ciclo de Vigência.
 */

import type {
  ContractProrrogationWorkflow,
  ProrrogationWorkflowStatus,
  ProrrogationDeadlinesPlan,
  ProrrogationReadinessChecklist,
  ProrrogationReajusteReadiness,
  FornecedorManifestacaoStatus
} from '../types/contractProrrogation';
import type {
  ContractDashboardRecord,
  ContractTaskTemplate,
  ContractTaskPlan,
  ContractEvent,
  ContractVigenciaTransition
} from '../types';
import type { ReajusteRadarAlert } from '../types/contractReajusteRadar';
import {
  parseDateBRT,
  formatDateISO,
  formatDateBR,
  addDays,
  addBusinessDays,
  differenceInDays,
  deriveTemporalStatus,
  deriveAtencaoNivel
} from './temporalEngineService';
import {
  generateIdempotentEventId,
  explainVigenciaTransition
} from './contractEventService';
import { evaluateContractReajusteRadar } from './contractReajusteRadarService';

/**
 * 1. Gera chave lógica determinística e canônica para o Workflow de Prorrogação.
 * Formato: WF::PRORROGACAO::{contractKey}::{cycleRef}
 */
export function generateProrrogationWorkflowId(contractKey: string, cycleRef: string): string {
  const sanitize = (s: string) => s.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').toUpperCase();
  return `WF::PRORROGACAO::${sanitize(contractKey)}::${sanitize(cycleRef)}`;
}

/**
 * 2. Calcula o Cronograma Operacional e Prazos Preventivos de Prorrogação.
 */
export function calculateProrrogationDeadlines(
  dataVigenciaFim: string,
  currentDate?: Date
): ProrrogationDeadlinesPlan | null {
  const baseDate = parseDateBRT(dataVigenciaFim);
  if (!baseDate) return null;

  const dataVigenciaAtual = formatDateISO(baseDate);
  const data180d = formatDateISO(addDays(baseDate, -180));
  const data120d = formatDateISO(addDays(baseDate, -120));
  const data10du = formatDateISO(addBusinessDays(addDays(baseDate, -120), 10));
  const data90d = formatDateISO(addDays(baseDate, -90));
  const data60d = formatDateISO(addDays(baseDate, -60));
  const data15d = formatDateISO(addDays(baseDate, -15));

  const diasRestantesVigencia = differenceInDays(baseDate, currentDate);
  const estadoTemporal = deriveTemporalStatus(diasRestantesVigencia);
  const nivelAtencao = deriveAtencaoNivel(diasRestantesVigencia, estadoTemporal);

  return {
    dataVigenciaAtual,
    inicioAnalise180d: data180d,
    consultaFornecedor120d: data120d,
    prazoRespostaFornecedor10du: data10du,
    pesquisaPrecos90d: data90d,
    remessaJuridica60d: data60d,
    previsaoAssinatura15d: data15d,
    limitePeremptorioVigencia0d: dataVigenciaAtual,
    diasRestantesVigencia,
    estadoTemporal,
    nivelAtencao
  };
}

/**
 * 3. Catálogo do Template Padrão de Tarefas de Prorrogação Contratual.
 * Conformidade estrita com os arts. 106 e 107 da Lei nº 14.133/2021.
 */
export function buildDefaultProrrogationTemplate(): ContractTaskTemplate {
  return {
    id: 'tpl-prorrogacao-padrao-14133',
    nome: 'Workflow Padrão de Prorrogação Contratual (Lei 14.133/21)',
    descricao: 'Roteiro instrutório e checklist operacional para renovação de vigência de contratos de serviços contínuos.',
    ativo: true,
    createdAt: '2026-09-23T00:00:00Z',
    updatedAt: '2026-09-23T00:00:00Z',
    macrotarefas: [
      {
        id: 'macro-prorr-1',
        templateId: 'tpl-prorrogacao-padrao-14133',
        nome: '1. Avaliação de Interesse e Consulta à Contratada',
        ordem: 1,
        tarefas: [
          {
            id: 'task-prorr-1',
            macrotaskId: 'macro-prorr-1',
            nome: 'Elaborar Nota Técnica de Justificativa e Interesse da Administração',
            ordem: 1,
            executionMode: 'INTERNA',
            sistemaDestino: 'SEI'
          },
          {
            id: 'task-prorr-2',
            macrotaskId: 'macro-prorr-1',
            nome: 'Expedir Ofício de Consulta de Interesse à Contratada (Prazo 10 dias úteis)',
            ordem: 2,
            executionMode: 'INTERNA',
            sistemaDestino: 'SEI'
          },
          {
            id: 'task-prorr-3',
            macrotaskId: 'macro-prorr-1',
            nome: 'Obter e Juntar aos autos a Manifestação Formal da Contratada',
            ordem: 3,
            executionMode: 'INTERNA',
            sistemaDestino: 'SEI'
          }
        ]
      },
      {
        id: 'macro-prorr-2',
        templateId: 'tpl-prorrogacao-padrao-14133',
        nome: '2. Economicidade, Vantajosidade e Habilitação',
        ordem: 2,
        tarefas: [
          {
            id: 'task-prorr-4',
            macrotaskId: 'macro-prorr-2',
            nome: 'Realizar Pesquisa de Preços de Mercado e Demonstração de Vantajosidade Econômica',
            ordem: 4,
            executionMode: 'INTERNA',
            sistemaDestino: 'Painel de Preços / SEI'
          },
          {
            id: 'task-prorr-5',
            macrotaskId: 'macro-prorr-2',
            nome: 'Verificar Regularidade Fiscal, Trabalhista e Previdenciária no SICAF/CND/FGTS',
            ordem: 5,
            executionMode: 'EXTERNA',
            sistemaDestino: 'SICAF / Compras.gov.br'
          }
        ]
      },
      {
        id: 'macro-prorr-3',
        templateId: 'tpl-prorrogacao-padrao-14133',
        nome: '3. Instrução Processual e Análise Jurídica',
        ordem: 3,
        tarefas: [
          {
            id: 'task-prorr-6',
            macrotaskId: 'macro-prorr-3',
            nome: 'Elaborar Minuta do Termo Aditivo de Prorrogação de Vigência',
            ordem: 6,
            executionMode: 'INTERNA',
            sistemaDestino: 'SEI'
          },
          {
            id: 'task-prorr-6b',
            macrotaskId: 'macro-prorr-3',
            nome: 'Verificar existência de pedidos pendentes de reajuste/repactuação e incluir cláusula de ressalva na minuta quando aplicável',
            ordem: 7,
            executionMode: 'INTERNA',
            sistemaDestino: 'SEI'
          },
          {
            id: 'task-prorr-7',
            macrotaskId: 'macro-prorr-3',
            nome: 'Submeter Processo à Consultoria Jurídica da União (CONJUR/AGU)',
            ordem: 8,
            executionMode: 'INTERNA',
            sistemaDestino: 'SEI / CONJUR'
          },
          {
            id: 'task-prorr-8',
            macrotaskId: 'macro-prorr-3',
            nome: 'Atender eventuais recomendações constantes do Parecer Jurídico da CONJUR/AGU',
            ordem: 9,
            executionMode: 'INTERNA',
            sistemaDestino: 'SEI'
          }
        ]
      },
      {
        id: 'macro-prorr-4',
        templateId: 'tpl-prorrogacao-padrao-14133',
        nome: '4. Assinatura, Eficácia e Publicação',
        ordem: 4,
        tarefas: [
          {
            id: 'task-prorr-9',
            macrotaskId: 'macro-prorr-4',
            nome: 'Coletar Assinatura Eletrônica das Partes no SEI antes da expiração da vigência',
            ordem: 10,
            executionMode: 'EXTERNA',
            sistemaDestino: 'SEI'
          },
          {
            id: 'task-prorr-10',
            macrotaskId: 'macro-prorr-4',
            nome: 'Publicar Termo Aditivo no PNCP e no Diário Oficial da União (DOU)',
            ordem: 11,
            executionMode: 'EXTERNA',
            sistemaDestino: 'Contratos.gov.br / PNCP'
          }
        ]
      }
    ]
  };
}

/**
 * Opções de contexto para avaliação assistida de prontidão (Fase 7.5-C4)
 */
export interface EvaluateProrrogationReadinessOptions {
  contract?: Partial<ContractDashboardRecord> & { dataBaseProposta?: string };
  events?: readonly ContractEvent[];
  radarAlert?: ReajusteRadarAlert | null;
}

/**
 * 4. Avaliação Assistida de Prontidão e Conformidade Legal para Prorrogação.
 */
export function evaluateProrrogationReadiness(
  workflow: Partial<ContractProrrogationWorkflow>,
  vigenciaFim?: string,
  currentDate?: Date,
  options?: EvaluateProrrogationReadinessOptions
): ProrrogationReadinessChecklist {
  const itensPendentes: string[] = [];
  const orientacoes: string[] = [];

  const interessePublicoManifesto = Boolean(workflow.vantajosidadeDocumentoSei || workflow.decisaoFinal === 'PRORROGAR');
  if (!interessePublicoManifesto) {
    itensPendentes.push('Justificativa formal do interesse da Administração na continuidade do contrato');
    orientacoes.push('Elabore a Nota Técnica justificando a necessidade contínua dos serviços.');
  }

  const fornecedorConcordancia = workflow.manifestacaoFornecedor === 'CONFIRMADO';
  if (!fornecedorConcordancia) {
    if (workflow.manifestacaoFornecedor === 'RECUSADO') {
      itensPendentes.push('Contratada recusou expressamente a prorrogação');
      orientacoes.push('Diante da recusa da empresa, inicie imediatamente o planejamento de novo certame licitatório ou encerramento.');
    } else {
      itensPendentes.push('Manifestação formal de concordância da Contratada pendente');
      orientacoes.push('Aguarde resposta formal ao Ofício de Consulta dentro do prazo concedido.');
    }
  }

  const vantajosidadePrecoComprovada = Boolean(workflow.vantajosidadeComprovada);
  if (!vantajosidadePrecoComprovada) {
    itensPendentes.push('Comprovação de vantajosidade econômica dos preços contratados');
    orientacoes.push('Junte mapa comparativo de preços de mercado ou demonstração de economicidade tarifária.');
  }

  const regularidadeFiscalValida = Boolean(workflow.regularidadeFiscalSicaf);
  if (!regularidadeFiscalValida) {
    itensPendentes.push('Certidões de regularidade fiscal e trabalhista válidas (SICAF)');
    orientacoes.push('Verifique e anexe certidões negativas de débitos previdenciários, FGTS e CNDT.');
  }

  const parecerJuridicoAprovado = Boolean(workflow.parecerConjurFavoravel);
  if (!parecerJuridicoAprovado) {
    itensPendentes.push('Parecer Jurídico favorável da CONJUR/AGU');
    orientacoes.push('Submeta a minuta de aditivo ao órgão jurídico com antecedência mínima de 60 dias.');
  }

  let tempestividadeGarantida = true;
  if (vigenciaFim) {
    const baseDate = parseDateBRT(vigenciaFim);
    if (baseDate) {
      const diff = differenceInDays(baseDate, currentDate);
      if (diff < 0) {
        tempestividadeGarantida = false;
        itensPendentes.push('Vigência contratual expirada — preclusão de prorrogação');
        orientacoes.push('Alerta Crítico: Termos aditivos de prorrogação celebrados após o término da vigência são nulos de pleno direito.');
      } else if (diff <= 15) {
        orientacoes.push('Atenção: Prazo crítico de vigência (< 15 dias). Priorize a coleta de assinaturas e publicação imediata.');
      }
    }
  }

  // Avaliação Assistida de Reajuste/Repactuação na Prorrogação (Fase 7.5-C4 — Não Bloqueante)
  let reajusteStatus: ProrrogationReajusteReadiness | undefined;

  if (options) {
    const events = options.events || [];
    let radarAlert = options.radarAlert;

    if (radarAlert === undefined && options.contract) {
      radarAlert = evaluateContractReajusteRadar({
        contract: options.contract,
        events,
        currentDate
      });
    }

    if (radarAlert) {
      const diasRestantes = radarAlert.diasRestantes;
      const dataAnivBR = formatDateBR(radarAlert.dataAniversario);

      if (diasRestantes >= 0) {
        // Situação A — Marco temporal próximo (<= 60 dias)
        const orientacao = `Marco de reajuste/repactuação próximo (${diasRestantes} dias). Avaliar previamente eventual impacto na prorrogação.`;
        const sugestaoRessalva = `Avaliar a necessidade de consignar ressalva na minuta/ato de prorrogação caso haja pedido de reajuste/repactuação em tramitação.`;

        reajusteStatus = {
          situacao: 'MARCO_PROXIMO',
          alertaRadarId: radarAlert.id,
          dataBaseReferencia: radarAlert.dataBase,
          dataAniversario: radarAlert.dataAniversario,
          diasRestantes,
          possuiEventoSubsequente: false,
          orientacao,
          sugestaoRessalva
        };

        orientacoes.push(
          `Reajuste/Repactuação: Marco anual em ${dataAnivBR} (${diasRestantes} dias restantes). ${sugestaoRessalva}`
        );
      } else {
        // Situação B — Marco temporal já ultrapassado (< 0 dias)
        const orientacao = `Verificar eventual pedido de reajuste/repactuação pendente antes da formalização da prorrogação.`;
        const sugestaoRessalva = `Avaliar a necessidade de consignar ressalva na minuta do Termo Aditivo de Prorrogação para resguardar eventual análise de reajuste/repactuação pendente.`;

        reajusteStatus = {
          situacao: 'MARCO_ULTRAPASSADO',
          alertaRadarId: radarAlert.id,
          dataBaseReferencia: radarAlert.dataBase,
          dataAniversario: radarAlert.dataAniversario,
          diasRestantes,
          possuiEventoSubsequente: false,
          orientacao,
          sugestaoRessalva
        };

        orientacoes.push(
          `Atenção Preventiva: Marco anual de reajuste/repactuação transcorrido há ${Math.abs(diasRestantes)} dia(s). ${orientacao} ${sugestaoRessalva}`
        );
      }
    } else {
      const hasFormalSubsequentEvent = events.some(
        (e) => e.tipoEvento === 'REAJUSTE' || e.tipoEvento === 'REPACTUACAO'
      );

      if (hasFormalSubsequentEvent) {
        // Situação C — Evento já formalizado
        reajusteStatus = {
          situacao: 'SEM_PENDENCIA',
          possuiEventoSubsequente: true,
          orientacao: 'Reajuste/repactuação formalizado em evento registrado. Sem pendência para este ciclo.'
        };
      } else if (options.contract) {
        const contract = options.contract;
        const hasAnyBase = Boolean(
          contract.dataBaseProposta ||
          contract.dataAssinatura ||
          contract.dataVigenciaInicio
        );

        if (!hasAnyBase) {
          // Situação D — Dados insuficientes
          reajusteStatus = {
            situacao: 'DADOS_INSUFICIENTES',
            possuiEventoSubsequente: false,
            orientacao: 'Dados temporais insuficientes para cálculo do marco anual de reajuste.'
          };
        } else {
          // Contrato com data-base mas fora da janela de alerta (> 60 dias)
          reajusteStatus = {
            situacao: 'SEM_PENDENCIA',
            possuiEventoSubsequente: false,
            orientacao: 'Fora da janela de proximidade do marco anual de reajuste.'
          };
        }
      }
    }
  }

  const isProntoParaAssinatura =
    interessePublicoManifesto &&
    fornecedorConcordancia &&
    vantajosidadePrecoComprovada &&
    regularidadeFiscalValida &&
    parecerJuridicoAprovado &&
    tempestividadeGarantida;

  return {
    interessePublicoManifesto,
    fornecedorConcordancia,
    vantajosidadePrecoComprovada,
    regularidadeFiscalValida,
    parecerJuridicoAprovado,
    tempestividadeGarantida,
    itensPendentes,
    isProntoParaAssinatura,
    orientacoes,
    reajusteStatus
  };
}

/**
 * 5. Deriva o Estado Operacional do Workflow de Prorrogação.
 */
export function deriveProrrogationStatus(
  workflow: Partial<ContractProrrogationWorkflow>,
  plan?: ContractTaskPlan | null
): ProrrogationWorkflowStatus {
  if (workflow.status === 'CANCELADO') return 'CANCELADO';
  if (workflow.decisaoFinal === 'NAO_PRORROGAR' || workflow.status === 'CONCLUIDO_NAO_PRORROGADO') {
    return 'CONCLUIDO_NAO_PRORROGADO';
  }
  if (workflow.termoAditivoPublicadoEm || workflow.status === 'CONCLUIDO_PRORROGADO') {
    return 'CONCLUIDO_PRORROGADO';
  }

  if (workflow.parecerConjurFavoravel) {
    return 'AGUARDANDO_ASSINATURA_PUBLICACAO';
  }

  if (workflow.parecerConjurNumero) {
    return 'EM_ANALISE_JURIDICA';
  }

  if (workflow.vantajosidadeComprovada) {
    return 'EM_INSTRUCAO_MINUTA';
  }

  if (workflow.manifestacaoFornecedor === 'CONFIRMADO') {
    return 'EM_PESQUISA_PRECOS';
  }

  if (workflow.manifestacaoFornecedor === 'PENDENTE' || (plan && plan.progresso.concluidas >= 1)) {
    return 'AGUARDANDO_FORNECEDOR';
  }

  if (workflow.dataInicio || (plan && plan.progresso.total > 0)) {
    return 'EM_ANALISE_INTERESSE';
  }

  return 'NAO_INICIADO';
}

/**
 * 6. Montagem Integrada da Entidade do Workflow de Prorrogação.
 */
export function assembleProrrogationWorkflow(params: {
  contract: ContractDashboardRecord;
  plan?: ContractTaskPlan | null;
  overrideData?: Partial<ContractProrrogationWorkflow>;
  currentDate?: Date;
  events?: readonly ContractEvent[];
}): ContractProrrogationWorkflow {
  const { contract, plan, overrideData = {}, currentDate, events } = params;
  const contractKey = contract.id;
  const anoContrato = typeof contract.ano === 'number' ? contract.ano : (parseInt(String(contract.ano), 10) || 2026);
  const dataVigenciaAtual = contract.dataVigenciaFim || 'Não Informado';
  const cycleRef = `VIG_${dataVigenciaAtual.replace(/\D/g, '') || 'INICIAL'}`;
  const workflowId = generateProrrogationWorkflowId(contractKey, cycleRef);

  // Calcula cronograma
  const deadlinesPlan = calculateProrrogationDeadlines(dataVigenciaAtual, currentDate) || {
    dataVigenciaAtual,
    inicioAnalise180d: dataVigenciaAtual,
    consultaFornecedor120d: dataVigenciaAtual,
    prazoRespostaFornecedor10du: dataVigenciaAtual,
    pesquisaPrecos90d: dataVigenciaAtual,
    remessaJuridica60d: dataVigenciaAtual,
    previsaoAssinatura15d: dataVigenciaAtual,
    limitePeremptorioVigencia0d: dataVigenciaAtual,
    diasRestantesVigencia: 0,
    estadoTemporal: 'FUTURO',
    nivelAtencao: 'NORMAL'
  };

  const manifestacaoFornecedor: FornecedorManifestacaoStatus = overrideData.manifestacaoFornecedor || 'PENDENTE';
  const vantajosidadeComprovada = Boolean(overrideData.vantajosidadeComprovada);
  const regularidadeFiscalSicaf = Boolean(overrideData.regularidadeFiscalSicaf);

  const mergedPartial: Partial<ContractProrrogationWorkflow> = {
    ...overrideData,
    manifestacaoFornecedor,
    vantajosidadeComprovada,
    regularidadeFiscalSicaf
  };

  const readiness = evaluateProrrogationReadiness(
    mergedPartial,
    dataVigenciaAtual,
    currentDate,
    { contract, events }
  );
  const status = overrideData.status || deriveProrrogationStatus(mergedPartial, plan);

  // Deriva vigência pretendida (+12 meses por padrão se não informada)
  let novaVigenciaPretendida = overrideData.novaVigenciaPretendida || '';
  if (!novaVigenciaPretendida && dataVigenciaAtual && dataVigenciaAtual !== 'Não Informado') {
    const curBase = parseDateBRT(dataVigenciaAtual);
    if (curBase) {
      const nextYear = new Date(curBase);
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      novaVigenciaPretendida = formatDateISO(nextYear);
    }
  }

  return {
    workflowId,
    contractKey,
    uasg: contract.uasg,
    numeroContrato: contract.numero,
    anoContrato,
    cycleRef,
    status,
    dataInicio: overrideData.dataInicio || contract.dataVigenciaInicio,
    dataVigenciaAtual,
    novaVigenciaPretendida,
    prazoLimiteConclusao: dataVigenciaAtual,
    responsavelGestorNome: overrideData.responsavelGestorNome,
    processoSeiId: overrideData.processoSeiId,
    processoSeiNumero: overrideData.processoSeiNumero || contract.processo,
    manifestacaoFornecedor,
    manifestacaoFornecedorData: overrideData.manifestacaoFornecedorData,
    manifestacaoFornecedorDocumentoSei: overrideData.manifestacaoFornecedorDocumentoSei,
    vantajosidadeComprovada,
    vantajosidadeDocumentoSei: overrideData.vantajosidadeDocumentoSei,
    regularidadeFiscalSicaf,
    regularidadeFiscalValidade: overrideData.regularidadeFiscalValidade,
    parecerConjurNumero: overrideData.parecerConjurNumero,
    parecerConjurFavoravel: overrideData.parecerConjurFavoravel,
    termoAditivoNumero: overrideData.termoAditivoNumero,
    termoAditivoPublicadoEm: overrideData.termoAditivoPublicadoEm,
    termoAditivoLinkPncp: overrideData.termoAditivoLinkPncp,
    decisaoFinal: overrideData.decisaoFinal,
    decisaoJustificativa: overrideData.decisaoJustificativa,
    decididoEm: overrideData.decididoEm,
    decididoPor: overrideData.decididoPor,
    concluidoEm: overrideData.concluidoEm,
    observacoes: overrideData.observacoes,
    deadlinesPlan,
    readiness,
    planTarefas: plan || undefined
  };
}

/**
 * 7. Conclusão do Ciclo de Prorrogação e Transição Determinística de Vigência.
 */
export function completeProrrogationCycle(params: {
  contract: ContractDashboardRecord;
  workflow: ContractProrrogationWorkflow;
  novaVigencia: string;
  termoAditivoNumero: string;
  dataPublicacaoPncp?: string;
  linkPncp?: string;
  currentDate?: Date;
}): {
  updatedContract: ContractDashboardRecord;
  event: ContractEvent;
  transition: ContractVigenciaTransition;
} {
  const { contract, workflow, novaVigencia, termoAditivoNumero, dataPublicacaoPncp, linkPncp, currentDate } = params;
  const contractKey = contract.id;
  const anoContrato = typeof contract.ano === 'number' ? contract.ano : (parseInt(String(contract.ano), 10) || 2026);
  const vigenciaAnterior = contract.dataVigenciaFim || workflow.dataVigenciaAtual;

  const eventId = generateIdempotentEventId({
    contractKey,
    tipoEvento: 'PRORROGACAO',
    identificadorOficial: termoAditivoNumero,
    cicloRef: workflow.cycleRef
  });

  const event: ContractEvent = {
    id: eventId,
    contractKey,
    uasg: contract.uasg,
    numeroContrato: contract.numero,
    anoContrato,
    tipoEvento: 'PRORROGACAO',
    naturezaInstrumento: 'TERMO_ADITIVO',
    identificadorOficial: termoAditivoNumero,
    descricao: `Prorrogação de Vigência celebrada via ${termoAditivoNumero}`,
    dataAssinatura: workflow.decididoEm || dataPublicacaoPncp,
    dataPublicacao: dataPublicacaoPncp,
    dataVigenciaEfeito: novaVigencia,
    impacto: 'ALTERA_VIGENCIA',
    vigenciaAnterior,
    vigenciaPosterior: novaVigencia,
    fonteOrigem: 'PNCP',
    linkPncp,
    processoSeiNumero: workflow.processoSeiNumero,
    capturedAt: new Date().toISOString()
  };

  const transition = explainVigenciaTransition({
    contract,
    event,
    currentDate
  });

  const updatedContract: ContractDashboardRecord = {
    ...contract,
    dataVigenciaFim: novaVigencia,
    statusVigencia: 'Vigente',
    lastSyncedAt: new Date().toISOString()
  };

  return {
    updatedContract,
    event,
    transition
  };
}
