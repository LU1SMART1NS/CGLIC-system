import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ItemExecutionSummaryStrip } from '../ItemExecutionSummaryStrip';
import type { ItemExecutionSummary } from '../../../utils/itemExecutionSummary';

const summary: ItemExecutionSummary = {
  homologado: 4863, contratado: 690, contratosSemQuantidade: 0, saldoAta: 4173,
  empenhado: 0, pendentes: 13, pendentesSugerido: 690, aEmpenhar: 690
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
    expect(out).toContain('690');
    expect(out).not.toContain('kpi-card');
    expect(out).not.toContain('Homologado');
  });

  it('avisa as pendências do item e oferece aceitar todas as sugestões a quem edita', () => {
    const out = html({ canEdit: true, aceitaveis: 13, onAcceptAll: vi.fn() });
    expect(out).toContain('empenhos-pendentes-banner');
    expect(out).toContain('empenhos pendentes de confirmação');
    expect(out).toContain('690 un sugeridas pelo valor');
    expect(out).toContain('Aceitar todas as sugestões do item');
  });

  it('quem não edita vê o aviso mas não o botão', () => {
    const out = html({ canEdit: false, aceitaveis: 13, onAcceptAll: vi.fn() });
    expect(out).toContain('empenhos-pendentes-banner');
    expect(out).not.toContain('Aceitar todas');
  });

  it('sem pendências não mostra o aviso', () => {
    expect(html({ summary: { ...summary, pendentes: 0, pendentesSugerido: 0 } })).not.toContain('empenhos-pendentes-banner');
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
