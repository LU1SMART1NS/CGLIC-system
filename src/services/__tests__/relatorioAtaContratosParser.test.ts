import { describe, expect, it } from 'vitest';
import { lerRelatorioAtaContratos, numeroBR, RelatorioInvalidoError } from '../relatorioAtaContratosParser';

// Texto extraído pelo unpdf do relatório do Contratos.gov.br da ata 00027/2026 (200331), item 15, gerado em 17/11/2026.
const ARQUIVOS = import.meta.glob('./fixtures/relatorio-ata-00027-2026-item15.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const TEXTO = ARQUIVOS['./fixtures/relatorio-ata-00027-2026-item15.txt'];

describe('lerRelatorioAtaContratos', () => {
  const r = lerRelatorioAtaContratos(TEXTO);

  it('lê ata, UASG e data do relatório', () => {
    expect(r.numeroAta).toBe('00027/2026');
    expect(r.uasg).toBe('200331');
    expect(r.geradoEm).toBe('2026-11-17T11:35:58');
    expect(r.avisos).toEqual([]);
  });

  it('lê os 30 órgãos do item 15, inclusive os que quebram de linha e de página', () => {
    expect(r.itens).toHaveLength(1);
    const item = r.itens[0];
    expect(item.numeroItem).toBe(15);
    expect(item.homologado).toBe(455);
    expect(item.unidades).toHaveLength(30);
    expect(item.somaRegistrada).toBe(455);
    const por = new Map(item.unidades.map((u) => [u.uasg, u]));
    expect(por.get('200331')).toEqual({ uasg: '200331', nome: 'SENASP', tipo: 'Gerenciadora', quantidade: 15, saldo: 14 });
    expect(por.get('925794')?.quantidade).toBe(32);
    expect(por.get('452386')?.quantidade).toBe(6);
    expect(por.get('927042')?.nome).toBe('SECRETARIA DA SEG. PÚBLICA DO EST. DA BAHIA');
    expect(por.get('929777')).toMatchObject({ nome: 'SECRETARIA DE EST.JUSTIÇA E SEGURANÇA PÚBLICA', quantidade: 20 });
    expect(por.get('462492')?.nome).toBe('21939771000119');
  });

  it('lê números com milhar', () => {
    expect(numeroBR('1.485.000')).toBe(1485000);
    expect(numeroBR('14,00')).toBe(14);
    expect(() => numeroBR('abc')).toThrow(RelatorioInvalidoError);
  });

  it('lê vários itens e avisa o item sem tabela de órgãos', () => {
    const doisItens = TEXTO
      .replace('DETALHAMENTO DO ITEM 00015', 'DETALHAMENTO DO ITEM 00003\nQuantidade\nhomologada: 1.000\nUNIDADE(S) ITEM 00003\n200331 SENASP Gerenciadora 1.000 900\nDETALHAMENTO DO ITEM 00004\nQuantidade\nhomologada: 5\nDETALHAMENTO DO ITEM 00015');
    const d = lerRelatorioAtaContratos(doisItens);
    expect(d.itens.map((i) => i.numeroItem)).toEqual([3, 15]);
    expect(d.itens[0].unidades).toEqual([{ uasg: '200331', nome: 'SENASP', tipo: 'Gerenciadora', quantidade: 1000, saldo: 900 }]);
    expect(d.avisos).toEqual(['Item 4: o relatório não traz a tabela de órgãos; fica de fora.']);
  });

  it('recusa outro documento', () => {
    expect(() => lerRelatorioAtaContratos('Edital do Pregão Eletrônico')).toThrow(RelatorioInvalidoError);
  });
});
