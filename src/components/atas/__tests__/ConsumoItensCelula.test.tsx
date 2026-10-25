import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConsumoItensCelula, type ConsumoItem } from '../ConsumoItensCelula';

describe('ConsumoItensCelula', () => {
  it('sem saldo mostra traço', () => {
    expect(renderToStaticMarkup(<ConsumoItensCelula itens={[]} />)).toContain('—');
  });

  it('um item: porcentagem e descrição, sem número do item', () => {
    const html = renderToStaticMarkup(<ConsumoItensCelula itens={[{ numero: '2', descricao: 'LANCHA, CASCO ALUMÍNIO', pct: 250 }]} />);
    expect(html).toContain('250%');
    expect(html).toContain('Lancha, casco alumínio');
    expect(html).not.toContain('Item 2');
  });

  it('vários itens: descrição do mais consumido com o número, sem quadradinhos', () => {
    const itens: ConsumoItem[] = [
      { numero: '1', descricao: 'Aeronaves Teleguiadas', pct: 3 },
      { numero: '2', descricao: 'Aeronaves Teleguiadas', pct: 119 }
    ];
    const html = renderToStaticMarkup(<ConsumoItensCelula itens={itens} />);
    expect(html).toContain('119%');
    expect(html).toContain('Item 2 · ');
    expect(html).not.toContain('data-quadradinho');
  });
});
