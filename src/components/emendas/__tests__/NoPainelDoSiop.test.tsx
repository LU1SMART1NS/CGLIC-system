import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LinhaPainelSiop } from '../../../services/emendasService';
import { NoPainelDoSiop } from '../emendas360/NoPainelDoSiop';

// Linha real do painel (03/11/2026): Adolfo Viana, emenda 3898 0002, transferência ao estado.
const linha = (extra: Partial<LinhaPainelSiop> = {}): LinhaPainelSiop => ({
  codigo: '202638980002', ano: 2026, emenda: '38980002', acao: '21F0 - Democratização do Acesso à Justiça e à Cidadania',
  modalidade: '30 - Transferências a Estados e ao Distrito Federal', autor: 'Adolfo Viana', dotacaoInicial: 1_000_000, dotacaoAtual: 950_000,
  empenhado: 950_000, liquidado: 0, pago: 0, baseSiafiEm: '2026-10-30', lidoEm: '2026-11-03T13:22:00Z', ...extra
});

describe('Emenda no painel do SIOP (migration 252)', () => {
  it('uma linha: valores do painel, base SIAFI e o valor registrado como referência, sem linha de total', () => {
    const html = renderToStaticMarkup(<NoPainelDoSiop linhas={[linha()]} valorRegistrado={950_000} />);
    expect(html).toContain('base SIAFI de 30/10/2026');
    expect(html).toContain('1.000.000,00');
    expect(html).toContain('950.000,00');
    expect(html).toContain('segue o registrado na conferência');
    expect(html).not.toContain('Total da emenda');
  });

  it('várias linhas: total da emenda; valor vazio vira "—"', () => {
    const html = renderToStaticMarkup(
      <NoPainelDoSiop linhas={[linha(), linha({ modalidade: '90 - Aplicações Diretas', dotacaoInicial: 0, dotacaoAtual: 50_000, empenhado: 50_000, liquidado: 636, pago: null })]} />
    );
    expect(html).toContain('Total da emenda');
    expect(html).toContain('636,00');
    expect(html).toContain('—');
    expect(html).not.toContain('segue o registrado');
  });

  it('sem linha no painel: não aparece', () => {
    expect(renderToStaticMarkup(<NoPainelDoSiop linhas={[]} />)).toBe('');
  });
});
