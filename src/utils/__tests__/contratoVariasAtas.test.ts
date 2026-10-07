import { describe, it, expect } from 'vitest';
import { itensEmOutraAta, outrasAtasDoContrato, outrasAtasPorContrato, podeEntrarEmMaisUmaAta, textoOutrasAtas } from '../contratoVariasAtas';

const vinculos = [
  { ataKey: '00053/2025', contractKey: '200331-00033-2026', numeroItem: 10 },
  { ataKey: '00025/2025', contractKey: '200331-00033-2026', numeroItem: 11 },
  { ataKey: '00041/2025', contractKey: '200331-00012-2026', numeroItem: 3 },
  { ataKey: '00041/2025', contractKey: '200331-00012-2026', numeroItem: 4 }
];
const compra = { uasg: '200331', numeroCompra: '90045', anoCompra: '2025' };

describe('contrato em mais de uma ata (migration 86)', () => {
  it('lista as outras atas do contrato com os itens de cada uma', () => {
    expect(outrasAtasDoContrato('200331-00033-2026', '00025/2025', vinculos)).toEqual([{ numeroAta: '00053/2025', itens: [10] }]);
    expect(outrasAtasDoContrato('200331-00012-2026', '00041/2025', vinculos)).toEqual([]);
    const mapa = outrasAtasPorContrato('00025/2025', vinculos);
    expect(mapa.get('200331-00012-2026')).toEqual([{ numeroAta: '00041/2025', itens: [3, 4] }]);
    expect(mapa.get('200331-00033-2026')).toEqual([{ numeroAta: '00053/2025', itens: [10] }]);
  });

  it('o contrato já em outra ata só entra nesta se for da mesma compra', () => {
    const outras = [{ numeroAta: '00053/2025', itens: [10] }];
    expect(podeEntrarEmMaisUmaAta({ idCompra: '20033105900452025' }, compra, outras)).toBe(true);
    expect(podeEntrarEmMaisUmaAta({ idCompra: '20033105900992025' }, compra, outras)).toBe(false);
    expect(podeEntrarEmMaisUmaAta({ idCompra: '20033105900452025' }, undefined, outras)).toBe(false);
    expect(podeEntrarEmMaisUmaAta({}, undefined, [])).toBe(true);
  });

  it('os itens que já estão em outra ata e o texto para a tela', () => {
    const outras = [{ numeroAta: '00053/2025', itens: [10] }, { numeroAta: '00041/2025', itens: [3, 4, 5] }];
    expect(Array.from(itensEmOutraAta(outras))).toEqual([[10, '00053/2025'], [3, '00041/2025'], [4, '00041/2025'], [5, '00041/2025']]);
    expect(textoOutrasAtas(outras)).toBe('Ata 00053/2025 (item 10), Ata 00041/2025 (itens 3, 4 e 5)');
  });
});
