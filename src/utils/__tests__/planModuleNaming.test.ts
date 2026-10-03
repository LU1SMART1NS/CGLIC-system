import { describe, expect, it } from 'vitest';
import { semOrdinal, sugerirNomeModulo } from '../planModuleNaming';

describe('sugerirNomeModulo', () => {
  it('sugere o 2º quando o modelo foi aplicado uma vez', () => {
    expect(sugerirNomeModulo('Termo aditivo', ['Termo aditivo'])).toBe('2º Termo aditivo');
  });

  it('segue a sequência pelos nomes já usados', () => {
    expect(sugerirNomeModulo('Termo aditivo', ['1º Termo aditivo', '2º Termo aditivo'])).toBe('3º Termo aditivo');
  });

  it('não repete número quando o 1º foi excluído', () => {
    expect(sugerirNomeModulo('Termo aditivo', ['2º Termo aditivo'])).toBe('3º Termo aditivo');
  });

  it('ignora ordinal no nome do modelo', () => {
    expect(sugerirNomeModulo('1º Termo aditivo', ['Termo aditivo'])).toBe('2º Termo aditivo');
  });

  it('semOrdinal só remove ordinal no início', () => {
    expect(semOrdinal('2º Termo aditivo')).toBe('Termo aditivo');
    expect(semOrdinal('Termo 2º aditivo')).toBe('Termo 2º aditivo');
  });
});
