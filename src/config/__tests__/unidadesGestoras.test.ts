import { describe, it, expect } from 'vitest';
import { isUasgCglic, cnpjDaUasg, codigoOrgaoDaUasg, CNPJ_SENASP, CODIGO_ORGAO_CGLIC } from '../unidadesGestoras';

describe('unidadesGestoras', () => {
  it('reconhece as UASGs do CGLIC', () => {
    expect(isUasgCglic('200331')).toBe(true);
    expect(isUasgCglic(200330)).toBe(true);
    expect(isUasgCglic('154080')).toBe(false);
    expect(isUasgCglic('')).toBe(false);
    expect(isUasgCglic(undefined)).toBe(false);
  });

  it('devolve o CNPJ cadastrado e vazio para UASG desconhecida', () => {
    expect(cnpjDaUasg('200331')).toBe(CNPJ_SENASP);
    expect(cnpjDaUasg(200330)).toBe(CNPJ_SENASP);
    // Só as UASGs do CGLIC têm CNPJ cadastrado; UASG de outro órgão (como a 154080) fica vazia
    expect(cnpjDaUasg('154080')).toBe('');
    expect(cnpjDaUasg('999999')).toBe('');
    expect(cnpjDaUasg(undefined)).toBe('');
  });

  it('devolve o código do órgão só para UASGs do CGLIC', () => {
    expect(codigoOrgaoDaUasg('200330')).toBe(CODIGO_ORGAO_CGLIC);
    expect(codigoOrgaoDaUasg('154080')).toBe('');
  });
});
