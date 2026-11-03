import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LinhaPainelSiop } from '../../../services/emendasService';
import { NoPainelDoSiop } from '../emendas360/NoPainelDoSiop';

// Linha real do painel (03/11/2026): Adolfo Viana, emenda 3898 0002, transferência ao estado.
const linha = (extra: Partial<LinhaPainelSiop> = {}): LinhaPainelSiop => ({
  codigo: '202638980002', ano: 2026, emenda: '38980002', autor: 'Adolfo Viana', orgao: '30000 - Ministério da Justiça e Segurança Pública',
  unidadeOrcamentaria: null, acao: '21F0 - Democratização do Acesso à Justiça e à Cidadania', localizador: null, gnd: null,
  modalidade: '30 - Transferências a Estados e ao Distrito Federal', naturezaDespesa: null, dotacaoInicial: 1_000_000, dotacaoAtual: 950_000,
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

  it('várias linhas: detalhe com GND, natureza e localizador, total da emenda; valor vazio vira "—"', () => {
    const html = renderToStaticMarkup(
      <NoPainelDoSiop
        linhas={[
          linha({ gnd: '3', naturezaDespesa: '33904000', localizador: '0001 - Nacional' }),
          linha({ modalidade: '90 - Aplicações Diretas', gnd: 'GND 4', dotacaoInicial: 0, dotacaoAtual: 50_000, empenhado: 50_000, liquidado: 636, pago: null })
        ]}
      />
    );
    expect(html).toContain('30 - Transferências a Estados e ao Distrito Federal · GND 3 · 33904000 · 0001 - Nacional');
    expect(html).toContain('90 - Aplicações Diretas · GND 4');
    expect(html).toContain('Total da emenda');
    expect(html).toContain('636,00');
    expect(html).toContain('—');
    expect(html).not.toContain('Ministério da Justiça');
  });

  it('emenda em mais de um órgão: o órgão aparece em cada linha', () => {
    const html = renderToStaticMarkup(<NoPainelDoSiop linhas={[linha(), linha({ orgao: '36000 - Ministério da Saúde' })]} />);
    expect(html).toContain('36000 - Ministério da Saúde');
    expect(html).toContain('30000 - Ministério da Justiça e Segurança Pública');
  });

  it('sem linha no painel: não aparece', () => {
    expect(renderToStaticMarkup(<NoPainelDoSiop linhas={[]} />)).toBe('');
  });
});
