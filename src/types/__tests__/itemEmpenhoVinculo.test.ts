import { describe, it, expect } from 'vitest';
import { estadoDoVinculo } from '../itemEmpenhoVinculo';

describe('estadoDoVinculo', () => {
  it('classifica o empenho pela quantidade e pela fonte', () => {
    expect(estadoDoVinculo({ quantidade: 2, fonte: 'API' })).toBe('OFICIAL');
    expect(estadoDoVinculo({ quantidade: 2, fonte: 'USUARIO' })).toBe('INFORMADA');
    expect(estadoDoVinculo({ quantidade: null, fonte: null })).toBe('PENDENTE');
  });
});
