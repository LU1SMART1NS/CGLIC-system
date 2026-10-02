import { describe, it, expect } from 'vitest';
import { quantitativoSenasp } from '../quantitativoSenasp';

const unidades = [
  { codigoUnidade: '200331', tipoUnidade: 'GERENCIADORA', quantidadeRegistrada: 801 },
  { codigoUnidade: '200330', tipoUnidade: 'PARTICIPANTE', quantidadeRegistrada: 100 },
  { codigoUnidade: '200109', tipoUnidade: 'PARTICIPANTE', quantidadeRegistrada: 70 }
];

describe('quantitativoSenasp', () => {
  it('soma 200330 e 200331 e ignora os demais órgãos', () => {
    expect(quantitativoSenasp(unidades, '200331')).toBe(901);
  });
  it('inclui a gerenciadora da ata quando for outra UASG', () => {
    expect(quantitativoSenasp([{ codigoUnidade: '154080', quantidadeRegistrada: 5 }, ...unidades], '154080')).toBe(906);
  });
  it('sem unidade SENASP, usa o fallback', () => {
    expect(quantitativoSenasp([unidades[2]], '200331', 42)).toBe(42);
  });
});

import { quantidadeBaseSenasp } from '../quantitativoSenasp';

describe('quantidadeBaseSenasp', () => {
  it('prefere a base da view, depois o quantitativo gravado, depois o homologado da ata', () => {
    expect(quantidadeBaseSenasp({ quantidade_base_senasp: 900, quantidade_senasp: 800, quantidade_homologada: 4863 })).toBe(900);
    expect(quantidadeBaseSenasp({ quantidade_senasp: 800, quantidade_homologada: 4863 })).toBe(800);
    expect(quantidadeBaseSenasp({ quantidade_senasp: null, quantidade_homologada: 4863 })).toBe(4863);
    expect(quantidadeBaseSenasp({})).toBe(0);
  });
});
