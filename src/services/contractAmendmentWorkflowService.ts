/**
 * Serviço de Gestão de Workflows Operacionais de Alteração Contratual e Apostilamento (SaldoARP — Fase 4.3B)
 *
 * Princípios Fundamentais:
 * 1. PROPOSTA ≠ DECISÃO ≠ INSTRUMENTO FORMAL ≠ FATO OFICIAL
 * 2. TERMO ADITIVO ≠ APOSTILAMENTO
 * 3. EVENTO ≠ WORKFLOW ≠ TAREFA
 * 4. FATO OFICIAL → EVENTO → WORKFLOW → TAREFA
 */

import type {
  ContractAmendmentWorkflow,
  AmendmentWorkflowStatus,
  AmendmentDecisionRecord,
  AmendmentFormalizationRecord,
  AmendmentOfficialConfirmation
} from '../types/contractAmendmentWorkflows';
import type {
  AmendmentType,
  AmendmentCategory,
  AmendmentInstrument,
  AmendmentValueEvolution,
  AmendmentOfficialityClassification
} from '../types/contractAmendments';
import type {
  ContractDashboardRecord,
  ContractTaskTemplate,
  ContractTaskPlan,
  ContractEvent
} from '../types';
import {
  classifyAmendment,
  calculateAmendmentValueEvolution,
  classifyOfficiality,
  buildContractAmendmentDomain,
  buildAmendmentEvent
} from './contractAmendmentService';
import { buildDefaultProrrogationTemplate } from './contractProrrogationService';

/**
 * 1. Gera chave lógica determinística e canônica para o Workflow de Alteração / Apostilamento.
 * Formato: WF::ALTERACAO::{contractKey}::{tipoAlteracao}::{cycleRef}
 */
export function generateAmendmentWorkflowId(
  contractKey: string,
  tipoAlteracao: AmendmentType,
  cycleRef: string,
  identificador?: string
): string {
  const sanitize = (s: string) => s.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').toUpperCase();
  const idSuffix = identificador ? `::${sanitize(identificador)}` : '';
  return `WF::ALTERACAO::${sanitize(contractKey)}::${sanitize(tipoAlteracao)}::${sanitize(cycleRef)}${idSuffix}`;
}

/**
 * 2. Catálogo de Templates Padrão para cada Tipo de Alteração Contratual e Apostilamento.
 * Atua como recomendação institucional configurável (SENASP/MJSP), permitindo dispensas motivadas.
 */
export function buildDefaultAmendmentTemplate(tipoAlteracao: AmendmentType): ContractTaskTemplate {
  if (tipoAlteracao === 'PRORROGACAO') {
    return buildDefaultProrrogationTemplate();
  }

  if (tipoAlteracao === 'ACRESCIMO') {
    return {
      id: 'tpl-acrescimo-padrao-14133',
      nome: 'Workflow Padrão de Acréscimo Quantitativo (Lei 14.133/21)',
      descricao: 'Roteiro instrutório para acréscimo de quantitativo/valor em até 25% (ou 50% para reforma).',
      ativo: true,
      createdAt: '2026-09-23T00:00:00Z',
      updatedAt: '2026-09-23T00:00:00Z',
      macrotarefas: [
        {
          id: 'macro-acresc-1',
          templateId: 'tpl-acrescimo-padrao-14133',
          nome: '1. Instrução Técnica e Limites Quantitativos',
          ordem: 1,
          tarefas: [
            {
              id: 'task-acresc-1',
              macrotaskId: 'macro-acresc-1',
              nome: 'Elaborar Nota Técnica com justificativa da necessidade de acréscimo de objeto/valor',
              ordem: 1,
              executionMode: 'INTERNA',
              sistemaDestino: 'SEI'
            },
            {
              id: 'task-acresc-2',
              macrotaskId: 'macro-acresc-1',
              nome: 'Verificar limites legais (até 25% ordinário ou até 50% reforma, art. 125)',
              ordem: 2,
              executionMode: 'AUTOMATICA',
              sistemaDestino: 'SaldoARP'
            },
            {
              id: 'task-acresc-3',
              macrotaskId: 'macro-acresc-1',
              nome: 'Verificar disponibilidade orçamentária para o acréscimo de despesa',
              ordem: 3,
              executionMode: 'INTERNA',
              sistemaDestino: 'SIAFI / SEI'
            },
            {
              id: 'task-acresc-4',
              macrotaskId: 'macro-acresc-1',
              nome: 'Consultar concordância da Contratada e regularidade no SICAF',
              ordem: 4,
              executionMode: 'EXTERNA',
              sistemaDestino: 'SICAF / Compras.gov.br'
            }
          ]
        },
        {
          id: 'macro-acresc-2',
          templateId: 'tpl-acrescimo-padrao-14133',
          nome: '2. Análise Jurídica e Decisão Administrativa',
          ordem: 2,
          tarefas: [
            {
              id: 'task-acresc-5',
              macrotaskId: 'macro-acresc-2',
              nome: 'Elaborar Minuta do Termo Aditivo de Acréscimo',
              ordem: 5,
              executionMode: 'INTERNA',
              sistemaDestino: 'SEI'
            },
            {
              id: 'task-acresc-6',
              macrotaskId: 'macro-acresc-2',
              nome: 'Submeter processo à Consultoria Jurídica (CONJUR/AGU)',
              ordem: 6,
              executionMode: 'INTERNA',
              sistemaDestino: 'SEI / CONJUR'
            },
            {
              id: 'task-acresc-7',
              macrotaskId: 'macro-acresc-2',
              nome: 'Aprovar formalmente o aditamento pela autoridade competente',
              ordem: 7,
              executionMode: 'INTERNA',
              sistemaDestino: 'SEI'
            }
          ]
        },
        {
          id: 'macro-acresc-3',
          templateId: 'tpl-acrescimo-padrao-14133',
          nome: '3. Assinatura, Publicação e Eficácia Oficial',
          ordem: 3,
          tarefas: [
            {
              id: 'task-acresc-8',
              macrotaskId: 'macro-acresc-3',
              nome: 'Coletar assinaturas no SEI e publicar Termo Aditivo no PNCP/DOU',
              ordem: 8,
              executionMode: 'EXTERNA',
              sistemaDestino: 'Contratos.gov.br / PNCP'
            }
          ]
        }
      ]
    };
  }

  if (tipoAlteracao === 'SUPRESSAO') {
    return {
      id: 'tpl-supressao-padrao-14133',
      nome: 'Workflow Padrão de Supressão Quantitativa (Lei 14.133/21)',
      descricao: 'Roteiro instrutório para redução unilateral (até 25%) ou bilateral (> 25%) de quantitativo/valor.',
      ativo: true,
      createdAt: '2026-09-23T00:00:00Z',
      updatedAt: '2026-09-23T00:00:00Z',
      macrotarefas: [
        {
          id: 'macro-supress-1',
          templateId: 'tpl-supressao-padrao-14133',
          nome: '1. Justificativa de Desnecessidade e Limites',
          ordem: 1,
          tarefas: [
            {
              id: 'task-supress-1',
              macrotaskId: 'macro-supress-1',
              nome: 'Elaborar Nota Técnica justificando a redução de demanda ou desnecessidade dos itens',
              ordem: 1,
              executionMode: 'INTERNA',
              sistemaDestino: 'SEI'
            },
            {
              id: 'task-supress-2',
              macrotaskId: 'macro-supress-1',
              nome: 'Calcular percentual de supressão sobre o valor inicial atualizado (sem compensação)',
              ordem: 2,
              executionMode: 'AUTOMATICA',
              sistemaDestino: 'SaldoARP'
            },
            {
              id: 'task-supress-3',
              macrotaskId: 'macro-supress-1',
              nome: 'Obter concordância formal da Contratada caso a supressão exceda 25% (art. 126)',
              ordem: 3,
              executionMode: 'INTERNA',
              sistemaDestino: 'SEI'
            }
          ]
        },
        {
          id: 'macro-supress-2',
          templateId: 'tpl-supressao-padrao-14133',
          nome: '2. Formalização do Termo Aditivo',
          ordem: 2,
          tarefas: [
            {
              id: 'task-supress-4',
              macrotaskId: 'macro-supress-2',
              nome: 'Elaborar Minuta de Termo Aditivo de Supressão e parecer jurídico se necessário',
              ordem: 4,
              executionMode: 'INTERNA',
              sistemaDestino: 'SEI'
            },
            {
              id: 'task-supress-5',
              macrotaskId: 'macro-supress-2',
              nome: 'Assinar Termo Aditivo e publicar no PNCP/DOU',
              ordem: 5,
              executionMode: 'EXTERNA',
              sistemaDestino: 'Contratos.gov.br / PNCP'
            }
          ]
        }
      ]
    };
  }

  if (tipoAlteracao === 'REAJUSTE') {
    return {
      id: 'tpl-reajuste-padrao-14133',
      nome: 'Workflow Padrão de Reajuste por Índice de Preços (Apostilamento)',
      descricao: 'Roteiro instrutório para reajuste de preços de bens e serviços por índice contratual (art. 136, I).',
      ativo: true,
      createdAt: '2026-09-23T00:00:00Z',
      updatedAt: '2026-09-23T00:00:00Z',
      macrotarefas: [
        {
          id: 'macro-reajuste-1',
          templateId: 'tpl-reajuste-padrao-14133',
          nome: '1. Apuração do Índice e Memória de Cálculo',
          ordem: 1,
          tarefas: [
            {
              id: 'task-reajuste-1',
              macrotaskId: 'macro-reajuste-1',
              nome: 'Verificar data-base da proposta e cláusula de reajustamento no contrato',
              ordem: 1,
              executionMode: 'AUTOMATICA',
              sistemaDestino: 'SaldoARP'
            },
            {
              id: 'task-reajuste-2',
              macrotaskId: 'macro-reajuste-1',
              nome: 'Apurar a variação acumulada do índice oficial pactuado (IPCA/INPC/IGP-M)',
              ordem: 2,
              executionMode: 'AUTOMATICA',
              sistemaDestino: 'SaldoARP / IBGE'
            },
            {
              id: 'task-reajuste-3',
              macrotaskId: 'macro-reajuste-1',
              nome: 'Elaborar Memória de Cálculo e Nota Técnica com os novos valores unitários e globais',
              ordem: 3,
              executionMode: 'INTERNA',
              sistemaDestino: 'SEI'
            },
            {
              id: 'task-reajuste-4',
              macrotaskId: 'macro-reajuste-1',
              nome: 'Confirmar dotação orçamentária para a diferença de valor resultante',
              ordem: 4,
              executionMode: 'INTERNA',
              sistemaDestino: 'SIAFI / SEI'
            }
          ]
        },
        {
          id: 'macro-reajuste-2',
          templateId: 'tpl-reajuste-padrao-14133',
          nome: '2. Lavratura do Termo de Apostilamento',
          ordem: 2,
          tarefas: [
            {
              id: 'task-reajuste-5',
              macrotaskId: 'macro-reajuste-2',
              nome: 'Lavrar Termo de Apostilamento (dispensa parecer jurídico prévio se mantida a regra editalícia)',
              ordem: 5,
              executionMode: 'INTERNA',
              sistemaDestino: 'SEI'
            },
            {
              id: 'task-reajuste-6',
              macrotaskId: 'macro-reajuste-2',
              nome: 'Juntar aos autos do processo SEI e enviar dados para divulgação no PNCP',
              ordem: 6,
              executionMode: 'EXTERNA',
              sistemaDestino: 'Contratos.gov.br / PNCP'
            }
          ]
        }
      ]
    };
  }

  if (tipoAlteracao === 'REPACTUACAO') {
    return {
      id: 'tpl-repactuacao-padrao-14133',
      nome: 'Workflow Padrão de Repactuação de Mão de Obra (Lei 14.133/21)',
      descricao: 'Roteiro instrutório para repactuação de custos de serviços contínuos com dedicação exclusiva de mão de obra.',
      ativo: true,
      createdAt: '2026-09-23T00:00:00Z',
      updatedAt: '2026-09-23T00:00:00Z',
      macrotarefas: [
        {
          id: 'macro-repact-1',
          templateId: 'tpl-repactuacao-padrao-14133',
          nome: '1. Análise da CCT e Planilha de Custos',
          ordem: 1,
          tarefas: [
            {
              id: 'task-repact-1',
              macrotaskId: 'macro-repact-1',
              nome: 'Conferir registro da Convenção Coletiva de Trabalho (CCT) no Ministério do Trabalho e Emprego',
              ordem: 1,
              executionMode: 'EXTERNA',
              sistemaDestino: 'Mediador / MTE'
            },
            {
              id: 'task-repact-2',
              macrotaskId: 'macro-repact-1',
              nome: 'Verificar tempestividade e ausência de preclusão lógica em relação a prorrogações anteriores',
              ordem: 2,
              executionMode: 'INTERNA',
              sistemaDestino: 'SEI / SaldoARP'
            },
            {
              id: 'task-repact-3',
              macrotaskId: 'macro-repact-1',
              nome: 'Auditar analiticamente a Planilha de Custos e Formação de Preços apresentada pela Contratada',
              ordem: 3,
              executionMode: 'INTERNA',
              sistemaDestino: 'SEI'
            }
          ]
        },
        {
          id: 'macro-repact-2',
          templateId: 'tpl-repactuacao-padrao-14133',
          nome: '2. Parecer Jurídico e Decisão',
          ordem: 2,
          tarefas: [
            {
              id: 'task-repact-4',
              macrotaskId: 'macro-repact-2',
              nome: 'Elaborar Minuta de Termo Aditivo de Repactuação e encaminhar à CONJUR/AGU',
              ordem: 4,
              executionMode: 'INTERNA',
              sistemaDestino: 'SEI / CONJUR'
            },
            {
              id: 'task-repact-5',
              macrotaskId: 'macro-repact-2',
              nome: 'Emitir Nota de Empenho de reforço para a cobertura da diferença salarial e retroativos',
              ordem: 5,
              executionMode: 'INTERNA',
              sistemaDestino: 'SIAFI / SEI'
            }
          ]
        },
        {
          id: 'macro-repact-3',
          templateId: 'tpl-repactuacao-padrao-14133',
          nome: '3. Assinatura e Publicação',
          ordem: 3,
          tarefas: [
            {
              id: 'task-repact-6',
              macrotaskId: 'macro-repact-3',
              nome: 'Assinar Termo Aditivo e publicar no PNCP/DOU',
              ordem: 6,
              executionMode: 'EXTERNA',
              sistemaDestino: 'Contratos.gov.br / PNCP'
            }
          ]
        }
      ]
    };
  }

  // Default: Alteração Qualitativa / Outra Alteração
  return {
    id: 'tpl-alteracao-geral-14133',
    nome: 'Workflow Padrão de Alteração Administrativa / Qualitativa',
    descricao: 'Roteiro instrutório geral para modificações contratuais e apostilamentos administrativos.',
    ativo: true,
    createdAt: '2026-09-23T00:00:00Z',
    updatedAt: '2026-09-23T00:00:00Z',
    macrotarefas: [
      {
        id: 'macro-alt-1',
        templateId: 'tpl-alteracao-geral-14133',
        nome: '1. Instrução e Justificativa Administrativa',
        ordem: 1,
        tarefas: [
          {
            id: 'task-alt-1',
            macrotaskId: 'macro-alt-1',
            nome: 'Elaborar justificativa técnica para a alteração contratual ou apostilamento',
            ordem: 1,
            executionMode: 'INTERNA',
            sistemaDestino: 'SEI'
          },
          {
            id: 'task-alt-2',
            macrotaskId: 'macro-alt-1',
            nome: 'Submeter à análise jurídica se o instrumento exigir parecer prévio',
            ordem: 2,
            executionMode: 'INTERNA',
            sistemaDestino: 'SEI / CONJUR'
          }
        ]
      },
      {
        id: 'macro-alt-2',
        templateId: 'tpl-alteracao-geral-14133',
        nome: '2. Formalização e Registro',
        ordem: 2,
        tarefas: [
          {
            id: 'task-alt-3',
            macrotaskId: 'macro-alt-2',
            nome: 'Lavrar o instrumento formal (Termo Aditivo ou Apostilamento) e juntar ao processo SEI',
            ordem: 3,
            executionMode: 'INTERNA',
            sistemaDestino: 'SEI'
          }
        ]
      }
    ]
  };
}

/**
 * 3. Deriva o Estado Operacional do Workflow de Alteração / Apostilamento.
 */
export function deriveAmendmentWorkflowStatus(
  workflow: Partial<ContractAmendmentWorkflow>,
  plan?: ContractTaskPlan | null
): AmendmentWorkflowStatus {
  if (workflow.status === 'CANCELADO') return 'CANCELADO';
  if (workflow.decisao?.status === 'NAO_APROVADO' || workflow.status === 'NAO_APROVADO') {
    return 'NAO_APROVADO';
  }
  if (workflow.confirmacaoOficial?.confirmado || workflow.status === 'CONCLUIDO_CONFIRMADO') {
    return 'CONCLUIDO_CONFIRMADO';
  }
  if (workflow.formalizacao?.numeroPublicacaoPncpDoi || workflow.formalizacao?.dataPublicacao || workflow.status === 'AGUARDANDO_CONFIRMACAO_OFICIAL') {
    return 'AGUARDANDO_CONFIRMACAO_OFICIAL';
  }
  if (workflow.formalizacao?.dataAssinatura) {
    return 'AGUARDANDO_PUBLICACAO';
  }
  if (workflow.decisao?.status === 'APROVADO') {
    return 'AGUARDANDO_FORMALIZACAO';
  }
  if (workflow.status === 'AGUARDANDO_DECISAO') {
    return 'AGUARDANDO_DECISAO';
  }
  if (workflow.status === 'AGUARDANDO_ANALISE_JURIDICA') {
    return 'AGUARDANDO_ANALISE_JURIDICA';
  }
  if (workflow.dataInicio || (plan && plan.progresso.total > 0)) {
    return 'EM_INSTRUCAO';
  }

  return 'NAO_INICIADO';
}

/**
 * 4. Montagem Integrada do Workflow Operacional de Alteração Contratual / Apostilamento.
 */
export function assembleAmendmentWorkflow(params: {
  contract: ContractDashboardRecord;
  tipoAlteracao: AmendmentType;
  naturezaInstrumento?: AmendmentInstrument;
  objetoDescricao: string;
  justificativa: string;
  valorProposto?: number;
  valorAprovado?: number;
  processoSeiId?: string;
  processoSeiNumero?: string;
  responsavelNome?: string;
  planTarefas?: ContractTaskPlan | null;
  reajusteMeta?: any;
  repactuacaoMeta?: any;
  apostilamentoMeta?: any;
  decisao?: AmendmentDecisionRecord;
  formalizacao?: AmendmentFormalizationRecord;
  confirmacaoOficial?: AmendmentOfficialConfirmation;
  statusOverride?: AmendmentWorkflowStatus;
  identificador?: string;
}): ContractAmendmentWorkflow {
  const {
    contract,
    tipoAlteracao,
    naturezaInstrumento,
    objetoDescricao,
    justificativa,
    valorProposto,
    valorAprovado,
    processoSeiId,
    processoSeiNumero,
    responsavelNome,
    planTarefas,
    reajusteMeta,
    repactuacaoMeta,
    apostilamentoMeta,
    decisao = {},
    formalizacao = {},
    confirmacaoOficial = { confirmado: false },
    statusOverride,
    identificador
  } = params;

  const contractKey = contract.id;
  const anoContrato = typeof contract.ano === 'number' ? contract.ano : (parseInt(String(contract.ano), 10) || 2026);
  const dataVigenciaAtual = contract.dataVigenciaFim || 'Não Informado';
  const cycleRef = `VIG_${dataVigenciaAtual.replace(/\D/g, '') || 'INICIAL'}`;

  const classification = classifyAmendment({
    tipoOuDescricao: objetoDescricao,
    variacaoValor: valorProposto !== undefined ? valorProposto - (contract.valorGlobal || 0) : undefined,
    isApostilamento: naturezaInstrumento === 'TERMO_APOSTILAMENTO',
    isRepactuacao: tipoAlteracao === 'REPACTUACAO',
    isReajuste: tipoAlteracao === 'REAJUSTE',
    isQualitativa: tipoAlteracao === 'ALTERACAO_QUALITATIVA'
  });

  const categoria: AmendmentCategory = classification.categoria;
  const resolvedInstrument: AmendmentInstrument = naturezaInstrumento || classification.naturezaInstrumento;

  const workflowId = generateAmendmentWorkflowId(contractKey, tipoAlteracao, cycleRef, identificador);

  const valorOriginal = contract.valorInicial || contract.valorGlobal || 0;
  const valorVigenteAnterior = contract.valorGlobal || valorOriginal;

  const valores: AmendmentValueEvolution = calculateAmendmentValueEvolution({
    valorOriginal,
    valorVigenteAnterior,
    valorProposto,
    valorAprovado,
    isOficial: confirmacaoOficial.confirmado,
    fonteValor: confirmacaoOficial.confirmado ? (confirmacaoOficial.fonteOficial || 'PNCP') : 'Proposta Administrativa'
  });

  const oficialidade: AmendmentOfficialityClassification = classifyOfficiality({
    fonte: confirmacaoOficial.confirmado ? (confirmacaoOficial.fonteOficial || 'PNCP') : (contract.fonteDados || 'SaldoARP'),
    dataPublicacaoOficial: formalizacao.dataPublicacao,
    numeroPublicacaoOficial: formalizacao.numeroPublicacaoPncpDoi,
    isFatoSoberano: confirmacaoOficial.confirmado
  });

  const partialWorkflow: Partial<ContractAmendmentWorkflow> = {
    decisao,
    formalizacao,
    confirmacaoOficial,
    dataInicio: contract.dataVigenciaInicio
  };

  const status = statusOverride || deriveAmendmentWorkflowStatus(partialWorkflow, planTarefas);

  return {
    workflowId,
    contractKey,
    uasg: contract.uasg,
    numeroContrato: contract.numero,
    anoContrato,
    cycleRef,
    tipoAlteracao,
    categoria,
    naturezaInstrumento: resolvedInstrument,
    status,
    dataInicio: contract.dataVigenciaInicio,
    responsavelNome,
    processoSeiId,
    processoSeiNumero: processoSeiNumero || contract.processo,
    objetoDescricao,
    justificativa,
    valores,
    oficialidade,
    decisao,
    formalizacao,
    confirmacaoOficial,
    reajusteMeta,
    repactuacaoMeta,
    apostilamentoMeta,
    planTarefas: planTarefas || undefined
  };
}

/**
 * 5. Confirmação Oficial Soberana da Alteração Contratual / Apostilamento.
 * Transiciona o workflow para 'CONCLUIDO_CONFIRMADO', gera o `ContractEvent` soberano e atualiza a projeção de exibição.
 */
export function confirmAmendmentWorkflowOfficially(params: {
  workflow: ContractAmendmentWorkflow;
  contract: ContractDashboardRecord;
  fonteOficial: string;
  dataConfirmacao?: string;
  numeroControlePncp?: string;
  linkPncp?: string;
  valorOficialConfirmado?: number;
  vigenciaOficialConfirmada?: string;
}): {
  updatedWorkflow: ContractAmendmentWorkflow;
  updatedContract: ContractDashboardRecord;
  event: ContractEvent;
} {
  const {
    workflow,
    contract,
    fonteOficial,
    dataConfirmacao = new Date().toISOString(),
    numeroControlePncp,
    linkPncp,
    valorOficialConfirmado,
    vigenciaOficialConfirmada
  } = params;

  const resolvedValor = valorOficialConfirmado !== undefined
    ? valorOficialConfirmado
    : (workflow.valores.valorAprovado || workflow.valores.valorProposto || contract.valorGlobal || 0);

  const confirmacaoOficial: AmendmentOfficialConfirmation = {
    confirmado: true,
    fonteOficial,
    dataConfirmacao,
    numeroControlePncp,
    valorOficialConfirmado: resolvedValor,
    vigenciaOficialConfirmada
  };

  const updatedValores: AmendmentValueEvolution = {
    ...workflow.valores,
    valorResultante: resolvedValor,
    variacaoAbsoluta: resolvedValor - workflow.valores.valorVigenteAnterior,
    variacaoPercentual: workflow.valores.valorVigenteAnterior > 0
      ? ((resolvedValor - workflow.valores.valorVigenteAnterior) / workflow.valores.valorVigenteAnterior) * 100
      : 0,
    isOficial: true,
    fonteValor: fonteOficial
  };

  const updatedOficialidade: AmendmentOfficialityClassification = {
    nivelOficialidade: 'FATO_OFICIAL',
    fonte: fonteOficial,
    dataPublicacaoOficial: workflow.formalizacao.dataPublicacao || dataConfirmacao.split('T')[0],
    numeroPublicacaoOficial: numeroControlePncp || workflow.formalizacao.numeroPublicacaoPncpDoi,
    isFatoSoberano: true,
    explicabilidade: `Alteração confirmada oficialmente pela fonte soberana (${fonteOficial}).`
  };

  const updatedWorkflow: ContractAmendmentWorkflow = {
    ...workflow,
    status: 'CONCLUIDO_CONFIRMADO',
    valores: updatedValores,
    oficialidade: updatedOficialidade,
    confirmacaoOficial
  };

  const domain = buildContractAmendmentDomain({
    contractKey: workflow.contractKey,
    uasg: workflow.uasg,
    numeroContrato: workflow.numeroContrato,
    anoContrato: workflow.anoContrato,
    cycleRef: workflow.cycleRef,
    tipoAlteracao: workflow.tipoAlteracao,
    categoria: workflow.categoria,
    naturezaInstrumento: workflow.naturezaInstrumento,
    numeroTermo: workflow.formalizacao.numeroTermo || 'Termo Formalizado',
    descricao: workflow.objetoDescricao,
    impactos: workflow.tipoAlteracao === 'ACRESCIMO' || workflow.tipoAlteracao === 'SUPRESSAO'
      ? ['ALTERA_QUANTITATIVO', 'ALTERA_VALOR']
      : ['ALTERA_VALOR'],
    valores: updatedValores,
    oficialidade: updatedOficialidade,
    novaVigencia: vigenciaOficialConfirmada,
    processoSeiId: workflow.processoSeiId,
    processoSeiNumero: workflow.processoSeiNumero,
    linkPncp: linkPncp || workflow.formalizacao.linkPncp
  });

  const event = buildAmendmentEvent(domain);

  const updatedContract: ContractDashboardRecord = {
    ...contract,
    valorGlobal: resolvedValor,
    dataVigenciaFim: vigenciaOficialConfirmada || contract.dataVigenciaFim,
    lastSyncedAt: new Date().toISOString()
  };

  return {
    updatedWorkflow,
    updatedContract,
    event
  };
}
