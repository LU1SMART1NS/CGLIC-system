import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractWorkflowStepper } from '../ContractWorkflowStepper';
import type { WorkflowMacrostepItem } from '../../../hooks/useContractWorkflows';

describe('ContractWorkflowStepper (Fase 5.4 — Stepper de Macroetapas)', () => {
  it('1. deve renderizar string vazia se a lista de macroetapas for vazia', () => {
    const html = renderToStaticMarkup(<ContractWorkflowStepper macroetapas={[]} />);
    expect(html).toBe('');
  });

  it('2. deve renderizar corretamente as macroetapas com status CONCLUIDA, ATUAL e FUTURA', () => {
    const macroetapas: WorkflowMacrostepItem[] = [
      { id: 'm1', label: '1. Avaliação de Interesse', status: 'CONCLUIDA', ordem: 1 },
      { id: 'm2', label: '2. Vantajosidade Econômica', status: 'ATUAL', ordem: 2 },
      { id: 'm3', label: '3. Minuta e Parecer Jurídico', status: 'FUTURA', ordem: 3 },
      { id: 'm4', label: '4. Publicação PNCP', status: 'FUTURA', ordem: 4 }
    ];

    const html = renderToStaticMarkup(<ContractWorkflowStepper macroetapas={macroetapas} />);

    // Verifica rótulos das macroetapas no HTML renderizado
    expect(html).toContain('1. Avaliação de Interesse');
    expect(html).toContain('2. Vantajosidade Econômica');
    expect(html).toContain('3. Minuta e Parecer Jurídico');
    expect(html).toContain('4. Publicação PNCP');

    // Verifica indicação da etapa em andamento
    expect(html).toContain('Em andamento');
  });

  it('3. não deve criar etapas artificiais nem alterar os rótulos fornecidos pelo domínio', () => {
    const macroetapas: WorkflowMacrostepItem[] = [
      { id: 'close-1', label: 'Verificação de Obrigações e TRD', status: 'CONCLUIDA', ordem: 1 },
      { id: 'close-2', label: 'Formalização do Encerramento', status: 'ATUAL', ordem: 2 },
      { id: 'close-3', label: 'Confirmação Oficial no PNCP', status: 'FUTURA', ordem: 3 }
    ];

    const html = renderToStaticMarkup(<ContractWorkflowStepper macroetapas={macroetapas} />);

    expect(html).toContain('Verificação de Obrigações e TRD');
    expect(html).toContain('Formalização do Encerramento');
    expect(html).toContain('Confirmação Oficial no PNCP');
    // Não deve conter nenhuma etapa fora do array
    expect(html).not.toContain('4.');
  });
});
