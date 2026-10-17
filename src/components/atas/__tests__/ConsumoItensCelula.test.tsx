import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConsumoItensCelula, MAX_QUADRADINHOS, type ConsumoItem } from '../ConsumoItensCelula';

const contar = (html: string) => (html.match(/data-quadradinho/g) || []).length;

describe('ConsumoItensCelula', () => {
  it('sem saldo mostra traço', () => {
    expect(renderToStaticMarkup(<ConsumoItensCelula itens={[]} />)).toContain('—');
  });

  it('um item: porcentagem e descrição, sem número do item nem quadradinhos', () => {
    const html = renderToStaticMarkup(<ConsumoItensCelula itens={[{ numero: '2', descricao: 'LANCHA, CASCO ALUMÍNIO', pct: 250 }]} />);
    expect(html).toContain('250%');
    expect(html).toContain('Lancha, casco alumínio');
    expect(html).not.toContain('Item 2');
    expect(contar(html)).toBe(0);
  });

  it('vários itens: descrição do mais consumido com o número e um quadradinho por item', () => {
    const itens: ConsumoItem[] = [
      { numero: '1', descricao: 'Aeronaves Teleguiadas', pct: 3 },
      { numero: '2', descricao: 'Aeronaves Teleguiadas', pct: 119 }
    ];
    const html = renderToStaticMarkup(<ConsumoItensCelula itens={itens} />);
    expect(html).toContain('119%');
    expect(html).toContain('Item 2 · ');
    expect(contar(html)).toBe(2);
  });

  it('muitos itens: uma linha só, com os mais consumidos e "+N"', () => {
    const itens: ConsumoItem[] = Array.from({ length: 67 }, (_, i) => ({ numero: String(i + 1), descricao: `Item ${i + 1}`, pct: i }));
    const html = renderToStaticMarkup(<ConsumoItensCelula itens={itens} />);
    expect(contar(html)).toBe(MAX_QUADRADINHOS - 1);
    expect(html).toContain(`+${67 - (MAX_QUADRADINHOS - 1)}`);
    expect(html).toContain('66%');
  });

  it('exatamente o limite: todos aparecem, sem "+N"', () => {
    const itens: ConsumoItem[] = Array.from({ length: MAX_QUADRADINHOS }, (_, i) => ({ numero: String(i + 1), descricao: 'x', pct: 10 }));
    const html = renderToStaticMarkup(<ConsumoItensCelula itens={itens} />);
    expect(contar(html)).toBe(MAX_QUADRADINHOS);
    expect(html).not.toMatch(/>\+\d+</);
  });
});
