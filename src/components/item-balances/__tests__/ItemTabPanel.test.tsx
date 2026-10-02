import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ItemTabPanel } from '../ItemTabPanel';

describe('ItemTabPanel', () => {
  it('é o mesmo quadro para qualquer aba, ligado à aba pelo id e aria-labelledby', () => {
    const quadros = ['unidades', 'contratos', 'alocacao', 'adesoes'].map((tab) => renderToStaticMarkup(<ItemTabPanel activeTab={tab}>x</ItemTabPanel>));
    for (const [i, tab] of ['unidades', 'contratos', 'alocacao', 'adesoes'].entries()) {
      expect(quadros[i]).toContain(`id="item-tabpanel-${tab}"`);
      expect(quadros[i]).toContain(`aria-labelledby="item-tab-${tab}"`);
      expect(quadros[i]).toContain('role="tabpanel"');
    }
    const estilo = (h: string) => /style="([^"]*)"/.exec(h)![1];
    expect(new Set(quadros.map(estilo)).size).toBe(1);
  });

  it('tem altura mínima, para a página não encolher ao trocar de aba', () => {
    expect(renderToStaticMarkup(<ItemTabPanel activeTab="contratos">x</ItemTabPanel>)).toContain('min-height:28rem');
  });
});
