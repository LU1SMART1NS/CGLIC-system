import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ItemExecutionSummaryStrip } from '../ItemExecutionSummaryStrip';
import type { ItemExecutionSummary } from '../../../utils/itemExecutionSummary';

const summary: ItemExecutionSummary = {
  homologado: 4863, contratado: 690, contratosSemQuantidade: 0, saldoAta: 4173,
  empenhado: 0, aEmpenhar: 690, notasAVincular: 4, valorAVincular: 245000, contratosSemItens: 0, valorSemDivisao: 0
};

const html = (over: Partial<Parameters<typeof ItemExecutionSummaryStrip>[0]> = {}) =>
  renderToStaticMarkup(
    <ItemExecutionSummaryStrip summary={summary} referencia={{ status: 'SEM_DADO', delta: 0 }} {...over} />
  );

describe('ItemExecutionSummaryStrip', () => {
  it('resume contratado, empenhado e a empenhar em uma linha, sem cartões', () => {
    const out = html();
    expect(out).toContain('Contratado');
    expect(out).toContain('Empenhado');
    expect(out).toContain('A empenhar');
    expect(out).toContain('690 de 4.863');
    expect(out).toContain('role="progressbar"');
    expect(out).not.toContain('kpi-card');
  });

  it('avisa as notas ainda a vincular aos itens e leva à Vinculação quem pode vincular', () => {
    const out = html({ onVincularAosItens: vi.fn() });
    expect(out).toContain('item-notas-a-vincular');
    expect(out).toContain('ainda não foram vinculadas');
    expect(out).toMatch(/R\$\s245\.000,00/);
    expect(out).toContain('Vincular aos itens');
    // Sem confirmação de quantidade por item.
    expect(out).not.toContain('Aceitar');
    expect(out).not.toContain('pendentes de confirmação');
  });

  it('quem não vincula vê o aviso mas não o botão', () => {
    const out = html();
    expect(out).toContain('item-notas-a-vincular');
    expect(out).not.toContain('Vincular aos itens');
  });

  it('sem notas a vincular não mostra o aviso', () => {
    expect(html({ summary: { ...summary, notasAVincular: 0, valorAVincular: 0 } })).not.toContain('item-notas-a-vincular');
  });

  it('contrato sem itens na fonte: avisa que as notas não têm divisão por item e não contam', () => {
    const out = html({ summary: { ...summary, contratosSemItens: 1, valorSemDivisao: 7500 } });
    expect(out).toContain('item-contratos-sem-itens');
    expect(out).toContain('sem divisão por item');
    expect(out).toMatch(/R\$\s7\.500,00/);
  });

  it('avisa quando faltam quantidades de contratos ainda não lidas', () => {
    expect(html({ summary: { ...summary, contratosSemQuantidade: 2 } })).toContain('2 contratos sem quantidade lida da API');
  });

  it('o Compras.gov acima do contratado vira aviso, sem alterar o saldo', () => {
    const out = html({ referencia: { status: 'ACIMA', consumido: 800, delta: 110 } });
    expect(out).toContain('registra mais consumo do que os contratos vinculados');
    expect(out).toContain('não altera o saldo da ata');
  });

  it('o Compras.gov abaixo, consistente ou sem dado não gera aviso', () => {
    for (const referencia of [
      { status: 'ABAIXO', consumido: 120, delta: -570 },
      { status: 'CONSISTENTE', consumido: 690, delta: 0 },
      { status: 'SEM_DADO', delta: 0 }
    ] as const) {
      expect(html({ referencia })).not.toContain('Compras.gov registra');
    }
  });

  it('mostra carregamento no lugar dos números', () => {
    const out = html({ loading: true });
    expect(out).toContain('Carregando contratos e empenhos');
    expect(out).not.toContain('empenhos-pendentes-banner');
  });
});
