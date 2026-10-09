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
  it('ata de outro órgão (SENASP participante): a gerenciadora é o outro órgão e não conta', () => {
    const daPf = [
      { codigoUnidade: '200342', tipoUnidade: 'GERENCIADORA', quantidadeRegistrada: 2641 },
      { codigoUnidade: '200331', tipoUnidade: 'PARTICIPANTE', quantidadeRegistrada: 4117 },
      { codigoUnidade: '200005', tipoUnidade: 'PARTICIPANTE', quantidadeRegistrada: 4382 }
    ];
    expect(quantitativoSenasp(daPf, '200342')).toBe(4117);
  });
  it('adesão (SENASP fora da lista de unidades): usa o fallback, o aprovado gravado no banco', () => {
    expect(quantitativoSenasp([{ codigoUnidade: '200109', tipoUnidade: 'GERENCIADORA', quantidadeRegistrada: 74505 }], '200109', 3000)).toBe(3000);
  });
  it('ata da CGLIC sem UASG informada: a gerenciadora conta', () => {
    expect(quantitativoSenasp([{ codigoUnidade: '999999', tipoUnidade: 'GERENCIADORA', quantidadeRegistrada: 7 }])).toBe(7);
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
