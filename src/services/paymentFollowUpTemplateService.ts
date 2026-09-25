/**
 * Serviço Gerador de Templates para Workflow de Acompanhamento de Pagamentos (SaldoARP 3.0 - Fase 7.4-C)
 * 
 * Reutiliza a infraestrutura canônica de ContractTaskTemplate com 5 macrotarefas e 11 tarefas atômicas.
 */

import type {
  ContractTaskTemplate,
  ContractTaskTemplateMacrotask,
  ContractTaskTemplateTask
} from '../types';
import type { PaymentCycleInput } from '../types/paymentFollowUp';

/**
 * Constrói o template especializado de tarefas para Acompanhamento de Pagamento / Faturamento
 */
export function buildPaymentFollowUpTemplate(
  context?: Partial<PaymentCycleInput>
): ContractTaskTemplate {
  const templateId = 'tpl-acompanhamento-pagamento-14133';

  // 1. Recepção e Atribuição do Atesto
  const macro1Tasks: ContractTaskTemplateTask[] = [
    {
      id: 'task-pgto-1-1',
      macrotaskId: 'macro-pgto-1',
      nome: 'Conferir conformidade formal do Termo de Atesto e dados das Notas Fiscais',
      ordem: 1,
      executionMode: 'INTERNA',
      sistemaDestino: 'SaldoARP'
    },
    {
      id: 'task-pgto-1-2',
      macrotaskId: 'macro-pgto-1',
      nome: 'Designar servidor responsável pela instrução e confecção do despacho',
      ordem: 2,
      executionMode: 'INTERNA',
      sistemaDestino: 'SaldoARP'
    }
  ];

  // 2. Instrução Processual e Conformidade Fiscal
  const macro2Tasks: ContractTaskTemplateTask[] = [
    {
      id: 'task-pgto-2-1',
      macrotaskId: 'macro-pgto-2',
      nome: 'Verificar regularidade fiscal e trabalhista do credor (SICAF / CNDs)',
      ordem: 1,
      executionMode: 'EXTERNA',
      sistemaDestino: 'SICAF',
      externalLinkUrl: 'https://www.gov.br/compras/pt-br/sicaf'
    },
    {
      id: 'task-pgto-2-2',
      macrotaskId: 'macro-pgto-2',
      nome: 'Conferir saldo disponível no empenho de lastro do contrato',
      ordem: 2,
      executionMode: 'AUTOMATICA',
      sistemaDestino: 'SaldoARP'
    },
    {
      id: 'task-pgto-2-3',
      macrotaskId: 'macro-pgto-2',
      nome: 'Elaborar e assinar minuta do Despacho de Instrução de Pagamento no SEI',
      ordem: 3,
      executionMode: 'EXTERNA',
      sistemaDestino: 'SEI'
    }
  ];

  // 3. Encaminhamento à CGOFI
  const macro3Tasks: ContractTaskTemplateTask[] = [
    {
      id: 'task-pgto-3-1',
      macrotaskId: 'macro-pgto-3',
      nome: 'Inserir Despacho no Processo de Pagamento e tramitar para a CGOFI',
      ordem: 1,
      executionMode: 'EXTERNA',
      sistemaDestino: 'SEI'
    },
    {
      id: 'task-pgto-3-2',
      macrotaskId: 'macro-pgto-3',
      nome: 'Registrar data de envio e calcular margem de dias úteis para o vencimento',
      ordem: 2,
      executionMode: 'AUTOMATICA',
      sistemaDestino: 'SaldoARP'
    }
  ];

  // 4. Acompanhamento e Controle de Prazos
  const macro4Tasks: ContractTaskTemplateTask[] = [
    {
      id: 'task-pgto-4-1',
      macrotaskId: 'macro-pgto-4',
      nome: 'Monitorar contador de dias úteis sem resposta da CGOFI',
      ordem: 1,
      executionMode: 'AUTOMATICA',
      sistemaDestino: 'SaldoARP'
    },
    {
      id: 'task-pgto-4-2',
      macrotaskId: 'macro-pgto-4',
      nome: 'Efetuar cobrança setorial caso excedido o prazo padrão de resposta',
      ordem: 2,
      executionMode: 'INTERNA',
      sistemaDestino: 'SEI'
    }
  ];

  // 5. Confirmação e Encerramento
  const macro5Tasks: ContractTaskTemplateTask[] = [
    {
      id: 'task-pgto-5-1',
      macrotaskId: 'macro-pgto-5',
      nome: 'Registrar/conciliar número da Ordem Bancária (OB) emitida',
      ordem: 1,
      executionMode: 'CONFIRMACAO',
      sistemaDestino: 'SIAFI / Contratos.gov'
    },
    {
      id: 'task-pgto-5-2',
      macrotaskId: 'macro-pgto-5',
      nome: 'Concluir e arquivar o ciclo operacional da competência',
      ordem: 2,
      executionMode: 'INTERNA',
      sistemaDestino: 'SaldoARP'
    }
  ];

  const macrotarefas: ContractTaskTemplateMacrotask[] = [
    {
      id: 'macro-pgto-1',
      templateId,
      nome: '1. Recepção e Atribuição do Atesto',
      ordem: 1,
      tarefas: macro1Tasks
    },
    {
      id: 'macro-pgto-2',
      templateId,
      nome: '2. Instrução Processual e Conformidade Fiscal',
      ordem: 2,
      tarefas: macro2Tasks
    },
    {
      id: 'macro-pgto-3',
      templateId,
      nome: '3. Encaminhamento à CGOFI',
      ordem: 3,
      tarefas: macro3Tasks
    },
    {
      id: 'macro-pgto-4',
      templateId,
      nome: '4. Acompanhamento e Controle de Prazos',
      ordem: 4,
      tarefas: macro4Tasks
    },
    {
      id: 'macro-pgto-5',
      templateId,
      nome: '5. Confirmação e Encerramento',
      ordem: 5,
      tarefas: macro5Tasks
    }
  ];

  const compLabel = context?.competencia ? ` - Competência ${context.competencia}` : '';

  return {
    id: templateId,
    nome: `Workflow de Acompanhamento de Pagamento (Faturamento${compLabel})`,
    descricao: 'Roteiro instrutório e checklist operacional de conferência de atesto, envio à CGOFI e monitoramento de prazos.',
    ativo: true,
    createdAt: '2026-09-24T00:00:00Z',
    updatedAt: '2026-09-24T00:00:00Z',
    macrotarefas
  };
}
