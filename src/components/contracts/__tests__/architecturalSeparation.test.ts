import { describe, it, expect } from 'vitest';
import type {
  ContractTask,
  ContractEvent,
  ContractDashboardRecord
} from '../../../types';
import { assembleProrrogationWorkflow } from '../../../services/contractProrrogationService';

describe('Separação Arquitetural Canônica (Fase 5.4 — Princípios Fundamentais)', () => {
  const mockContract: ContractDashboardRecord = {
    id: '200331-00015-2026',
    numero: '15',
    ano: 2026,
    numeroFormatado: '00015/2026',
    uasg: '200331',
    nomeUnidadeGestora: 'SENASP',
    objeto: 'Serviços de Tecnologia da Informação',
    processo: '08020.001234/2026-11',
    fornecedorNome: 'TechCorp Brasil Ltda',
    fornecedorCnpjCpf: '12.345.678/0001-90',
    valorGlobal: 1200000.0,
    valorInicial: 1200000.0,
    dataAssinatura: '2026-01-10',
    dataVigenciaInicio: '2026-01-15',
    dataVigenciaFim: '2027-01-15',
    statusVigencia: 'Vigente',
    fonteDados: 'Contratos.gov.br'
  };

  it('1. Princípio WORKFLOW ≠ TASK: A entidade de workflow coordena macroetapas e metadados, mas não é uma tarefa atômica executável', () => {
    const workflow = assembleProrrogationWorkflow({ contract: mockContract });

    // Um workflow tem identificador determinístico no padrão WF::{tipo}::{key}::{cycleRef}
    expect(workflow.workflowId).toMatch(/^WF::PRORROGACAO::/);

    // Um workflow NÃO possui a estrutura plana de uma tarefa individual (sem status PENDENTE/CONCLUIDA de tarefa individual, sem executionMode)
    expect((workflow as unknown as ContractTask).macrotaskId).toBeUndefined();
    expect((workflow as unknown as ContractTask).executionMode).toBeUndefined();
    expect(workflow.status).not.toBe('PENDENTE'); // Status de workflow são estritamente de processo (ex: EM_ANALISE_INTERESSE, NAO_INICIADO)
  });

  it('2. Princípio WORKFLOW ≠ EVENT: O workflow é um processo operacional em andamento; um evento é um registro histórico imutável', () => {
    const workflow = assembleProrrogationWorkflow({ contract: mockContract });

    // Workflow possui estados transitórios, checklist e cronograma
    expect(workflow.deadlinesPlan).toBeDefined();
    expect(workflow.readiness).toBeDefined();

    // Workflow NÃO é um ContractEvent da Timeline
    expect((workflow as unknown as ContractEvent).tipoEvento).toBeUndefined();
    expect((workflow as unknown as ContractEvent).identificadorOficial).toBeUndefined();
    expect((workflow as unknown as ContractEvent).naturezaInstrumento).toBeUndefined();
  });

  it('3. Princípio WORKFLOW ≠ FATO OFICIAL: O avanço interno no workflow não confere eficácia jurídica oficial nem substitui a publicação soberana (PNCP/DOU)', () => {
    // Um workflow com parecer jurídico aprovado internamente ainda aguarda assinatura e publicação oficial
    const advancedWorkflow = assembleProrrogationWorkflow({
      contract: mockContract,
      overrideData: {
        parecerConjurFavoravel: true,
        parecerConjurNumero: 'Parecer Conjur nº 123/2026'
      }
    });

    expect(advancedWorkflow.status).toBe('AGUARDANDO_ASSINATURA_PUBLICACAO');
    // Não é considerado prorrogado oficialmente até a publicação soberana
    expect(advancedWorkflow.status).not.toBe('CONCLUIDO_PRORROGADO');
    expect(advancedWorkflow.termoAditivoPublicadoEm).toBeUndefined();
  });
});
