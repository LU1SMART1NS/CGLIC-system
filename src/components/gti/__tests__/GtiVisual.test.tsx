import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GtiCelulaAta, GtiFatiaBar } from '../GtiVisual';
import type { FatiasDaAta } from '../../../config/gruposGti';

const dividida = {
  total: 1000,
  fatias: [
    { grupo: 'LIGABOM', quantidade: 920, orgaos: 9, pct: 92 },
    { grupo: 'CONSESP', quantidade: 80, orgaos: 1, pct: 8 }
  ],
  principal: { grupo: 'LIGABOM', quantidade: 920, orgaos: 9, pct: 92 },
  orgaosAConfirmar: 0
} as unknown as FatiasDaAta;
const soLigabom = {
  total: 300,
  fatias: [{ grupo: 'LIGABOM', quantidade: 300, orgaos: 3, pct: 100 }],
  principal: { grupo: 'LIGABOM', quantidade: 300, orgaos: 3, pct: 100 },
  orgaosAConfirmar: 0
} as unknown as FatiasDaAta;
const soOutros = {
  total: 50,
  fatias: [{ grupo: 'OUTROS', quantidade: 50, orgaos: 1, pct: 100 }],
  principal: null,
  orgaosAConfirmar: 0
} as unknown as FatiasDaAta;

describe('Célula GTI das carteiras', () => {
  it('com divisão: percentual e barra fina de 4px', () => {
    const h = renderToStaticMarkup(<GtiCelulaAta fatias={dividida} />);
    expect(h).toContain('LIGABOM 92%');
    expect(h).toContain('Fatia por GTI');
    expect(h).toMatch(/height:4px/);
  });

  it('um GTI só: nome com "único grupo" e sem barra', () => {
    const h = renderToStaticMarkup(<GtiCelulaAta fatias={soLigabom} />);
    expect(h).toContain('LIGABOM');
    expect(h).toContain('único grupo');
    expect(h).not.toContain('LIGABOM 100%');
    expect(h).not.toContain('Fatia por GTI');
  });

  it('só órgãos fora dos GTIs: mantém "Outros 100%", sem barra', () => {
    const h = renderToStaticMarkup(<GtiCelulaAta fatias={soOutros} />);
    expect(h).toContain('Outros 100%');
    expect(h).not.toContain('único grupo');
    expect(h).not.toContain('Fatia por GTI');
  });
});

describe('Barra das fatias', () => {
  it('na gaveta fica com 8px e um pedaço por grupo, proporcional à quantidade', () => {
    const h = renderToStaticMarkup(<GtiFatiaBar fatias={dividida} />);
    expect(h).toMatch(/height:8px/);
    expect(h).toContain('flex:920 1 0');
    expect(h).toContain('flex:80 1 0');
  });
});

describe('Célula GTI: filtro e detalhe', () => {
  it('o nome do GTI principal tem a marca que recebe o sublinhado do filtro; a segunda fatia não', () => {
    const h = renderToStaticMarkup(<GtiCelulaAta fatias={dividida} />);
    expect(h).toMatch(/class="gti-nome-principal">LIGABOM 92%</);
    expect(h).not.toMatch(/gti-nome-principal">CONSESP/);
  });

  it('o quadro de porcentagens só abre ao passar o mouse (fechado de início)', () => {
    const h = renderToStaticMarkup(<GtiCelulaAta fatias={dividida} testId="c" />);
    expect(h).not.toContain('c-detalhe');
  });
});
