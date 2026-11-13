import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FaixaDaUnidade, FaixaDoGti } from '../FaixaDoFiltro';

const totais = { atas: 39, valorTotal: 2000, valorSenasp: 1500, valorConsumido: 300, registradoParticipantes: 1000, registradoGti: 770, alocadoUnidade: 600 };

describe('Faixas do filtro na Carteira de Atas', () => {
  it('GTI: quantas atas, registrado pelo GTI e a parte dele no valor total das atas', () => {
    const html = renderToStaticMarkup(<FaixaDoGti gti="LIGABOM" totais={totais} />);
    expect(html).toContain('LIGABOM');
    expect(html).toContain('39 atas');
    expect(html).toMatch(/Registrado <b[^>]*>R\$\s770,00<\/b>/);
    expect(html).toMatch(/39% do valor total das atas \(R\$\s2\.000,00\)/);
    expect(html).not.toContain('SENASP');
  });

  it('unidade: quantas atas, alocado à unidade e a parte disso no valor SENASP das atas', () => {
    const html = renderToStaticMarkup(<FaixaDaUnidade nome="CAEP" totais={totais} />);
    expect(html).toContain('CAEP');
    expect(html).toContain('39 atas');
    expect(html).toMatch(/Alocado <b[^>]*>R\$\s600,00<\/b>/);
    expect(html).toMatch(/40% do valor SENASP das atas \(R\$\s1\.500,00\)/);
  });

  it('sem unidade: o que ainda falta alocar', () => {
    const html = renderToStaticMarkup(<FaixaDaUnidade nome="Sem unidade" semUnidade totais={totais} />);
    expect(html).toContain('Sem unidade');
    expect(html).toMatch(/A alocar <b[^>]*>R\$\s600,00<\/b>/);
    expect(html).not.toContain('Alocado');
  });
});
