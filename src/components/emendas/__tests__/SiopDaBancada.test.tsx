import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { EmendaSiop } from '../../../services/emendasService';
import { SiopDaBancada } from '../emendas360/SiopDaBancada';

// Bancada do AP (SIOP de 29/10/2026): compra direta R$ 6.249.810,36 com bloqueios e a linha de transferência ao estado.
const bancada = (extra: Partial<EmendaSiop> = {}): EmendaSiop => ({
  id: 'b1', ano: 2026, numero: '71050008', autorId: 'B:AP', valor: 6_249_810.36, gnd: 'GND-4', beneficiarioId: null, objeto: null, vistaEm: '2026-10-29',
  observacao: null, versao: 1, criadoPorNome: null, ...extra
});

describe('Emenda de bancada no SIOP (D6, 29/10/2026)', () => {
  it('mostra os bloqueios e a linha fora da compra direta, sem mudar o valor da emenda', () => {
    const html = renderToStaticMarkup(
      <SiopDaBancada
        e={bancada({ bloqueadoControle: 365_692, bloqueadoProgramacao: 5_584_308, siopLidoEm: '2026-10-29', foraCompraDireta: [{ acao: '21BM', modalidade: '30', autorizado: 6_700_189.64, empenhado: 0 }] })}
      />
    );
    expect(html).toContain('21BM · modalidade 90 (compra direta)');
    expect(html).toContain('6.249.810,36');
    expect(html).toContain('365.692,00');
    expect(html).toContain('5.584.308,00');
    expect(html).toContain('21BM · modalidade 30');
    expect(html).toContain('fora da compra direta');
    expect(html).toContain('6.700.189,64');
    expect(html).toContain('lido em 29/10/2026');
  });

  it('não aparece sem bloqueio nem linha fora da compra direta', () => {
    expect(renderToStaticMarkup(<SiopDaBancada e={bancada()} />)).toBe('');
  });
});
