import { describe, it, expect } from 'vitest';
import { htmlParaSei, montarQuadro, nomeDoItem, notaDoPreco, textoParaWhatsapp, tituloDoAnexo, type LinhaDoPedidoNoQuadro } from '../emendasQuadro';
import type { AutorEmenda, BeneficiarioEmenda, ItemCaep } from '../../services/emendasService';
import type { PrecoPrevisto } from '../../services/emendasQuadroService';

const item = (k: string, extra: Partial<ItemCaep>): ItemCaep => ({
  itemKey: k, numeroAta: '00031/2025', codigoUasg: '200331', numeroItem: '00001', descricao: 'ITEM', codigoPdm: 1,
  valorUnitario: 100, vigenciaFinal: '2027-06-25', ataEncerrada: false, alocado: 100, nomeCurto: null, gnd: 'GND-4', ...extra
});
const preco = (k: string, extra: Partial<PrecoPrevisto>): PrecoPrevisto => ({
  itemKey: k, precoAtual: 100, precoPrevisto: 100, motivo: 'EM_DIA', devido: false, efeito: null, percentual: null, mesesEstimados: null, ...extra
});
const pm = { id: 'b1', razaoSocial: 'Secretaria de Estado de Polícia Militar do Rio de Janeiro', entregaMunicipio: 'Rio de Janeiro', entregaUf: 'RJ' } as BeneficiarioEmenda;
const autor = { id: 'S:1', tipo: 'SENADOR', nome: 'Romário', uf: 'RJ' } as AutorEmenda;

const itens = new Map([
  item('suv', { nomeCurto: 'Camioneta/SUV médio', valorUnitario: 191811.62 }),
  item('tablet', { nomeCurto: 'Tablet', valorUnitario: 1528.8, numeroAta: '00043/2026', numeroItem: '5' }),
  item('drone', { nomeCurto: 'Drone', valorUnitario: 45200 }),
  item('mesa', { nomeCurto: 'Mesa flexora', valorUnitario: 7361.9 }),
  item('leg', { nomeCurto: 'Leg press 45°', valorUnitario: 8087.57 }),
  item('colchonete', { nomeCurto: 'Colchonete', valorUnitario: 52, gnd: 'GND-3' })
].map((i) => [i.itemKey, i]));
const precos = new Map([
  preco('suv', { precoAtual: 191811.62, precoPrevisto: 191811.62 }),
  preco('tablet', { precoAtual: 1528.8, precoPrevisto: 1598.76, motivo: 'DEVIDO', devido: true }),
  preco('drone', { precoAtual: 45200, precoPrevisto: 47158.83, motivo: 'SE_PRORROGAR', efeito: '2027-09-08', percentual: 4.33, mesesEstimados: 8 }),
  preco('colchonete', { precoAtual: 52, precoPrevisto: 54.69, motivo: 'DEVIDO', devido: true })
].map((p) => [p.itemKey, p]));
const linhas: LinhaDoPedidoNoQuadro[] = [
  { tipo: 'ITEM', itemKey: 'suv', kitNome: null, kitComposicao: null, quantidade: 5, beneficiarioId: 'b1' },
  { tipo: 'ITEM', itemKey: 'tablet', kitNome: null, kitComposicao: null, quantidade: 10, beneficiarioId: 'b1' },
  { tipo: 'ITEM', itemKey: 'drone', kitNome: null, kitComposicao: null, quantidade: 2, beneficiarioId: null, beneficiarioNome: 'CBMERJ (da planilha)' },
  { tipo: 'KIT', itemKey: null, kitNome: 'Kit Academia', kitComposicao: [{ itemKey: 'mesa', quantidade: 1 }, { itemKey: 'leg', quantidade: 2 }], quantidade: 2, beneficiarioId: null },
  { tipo: 'ITEM', itemKey: 'colchonete', kitNome: null, kitComposicao: null, quantidade: 100, beneficiarioId: null }
];
const q = montarQuadro({ autor, linhas, itens, beneficiarios: new Map([['b1', pm]]), precos, data: '2026-10-23' });

describe('quadro da reserva (Anexo)', () => {
  it('uma linha por item, kit aberto nos seus itens com a quantidade de kits', () => {
    expect(q.linhas.map((l) => [l.descricao, l.quantidade, l.kit])).toEqual([
      ['Camioneta/SUV médio', 5, null],
      ['Tablet', 10, null],
      ['Drone', 2, null],
      ['Mesa flexora', 2, 'Kit Academia'],
      ['Leg press 45°', 4, 'Kit Academia'],
      ['Colchonete', 100, null]
    ]);
  });

  it('beneficiário do cadastro, da planilha ou a definir', () => {
    expect(q.linhas[0]).toMatchObject({ beneficiario: pm.razaoSocial, municipio: 'Rio de Janeiro - RJ' });
    expect(q.linhas[0]).not.toHaveProperty('orgao');
    expect(q.linhas[2]).toMatchObject({ beneficiario: 'CBMERJ (da planilha)', municipio: null });
    expect(q.semBeneficiario).toBe(3);
    expect(q.semNomeCurto).toBe(0);
  });

  it('valor unitário com o reajuste previsto e uma nota por motivo', () => {
    expect(q.linhas[1]).toMatchObject({ unitario: 1598.76, hoje: 1528.8, total: 15987.6, marca: '¹' });
    expect(q.linhas[2]).toMatchObject({ unitario: 47158.83, marca: '²' });
    expect(q.linhas[5].marca).toBe('¹');
    expect(q.linhas[0].marca).toBe('');
    expect(q.notas[0]).toBe('¹ Reajuste do IPCA já devido, ainda não aplicado na ata.');
    expect(q.notas[1]).toBe('² Se a ata for prorrogada em 09/2027 (IPCA previsto de 4,33%, 8 meses pela projeção do Focus).');
    expect(q.notas[2]).toContain('Pelo preço de hoje o total seria');
  });

  it('total a empenhar e total por GND quando mistura investimento e custeio', () => {
    const esperado = 959058.1 + 15987.6 + 94317.66 + 14723.8 + 32350.28 + 5469;
    expect(q.total).toBeCloseTo(esperado, 2);
    expect(q.porGnd).toEqual([
      { gnd: 'GND-4', rotulo: 'Total GND-4 · Investimento', total: Math.round((esperado - 5469) * 100) / 100 },
      { gnd: 'GND-3', rotulo: 'Total GND-3 · Custeio', total: 5469 }
    ]);
    const comSemGnd = montarQuadro({ autor, linhas: [linhas[0], linhas[4]], itens: new Map([...itens, ['suv', { ...itens.get('suv')!, gnd: null }]]), beneficiarios: new Map(), precos, data: '2026-10-23' });
    expect(comSemGnd.porGnd).toEqual([]);
    const tres = montarQuadro({ autor, linhas: [linhas[0], linhas[1], linhas[4]], itens: new Map([...itens, ['tablet', { ...itens.get('tablet')!, gnd: null }]]), beneficiarios: new Map(), precos, data: '2026-10-23' });
    expect(tres.porGnd.map((g) => g.rotulo)).toEqual(['Total GND-4 · Investimento', 'Total GND-3 · Custeio', 'Total sem GND informado']);
    expect(tres.porGnd.reduce((s, g) => s + g.total, 0)).toBeCloseTo(tres.total, 2);
    const so4 = montarQuadro({ autor, linhas: linhas.slice(0, 2), itens, beneficiarios: new Map(), precos, data: '2026-10-23' });
    expect(so4.porGnd).toEqual([]);
  });

  it('SEI: ata, item e as 6 colunas do Anexo (sem ÓRGÃO) e a linha TOTAL A EMPENHAR', () => {
    const html = htmlParaSei(q);
    for (const h of ['ATA', 'ITEM', 'DESCRIÇÃO ITEM', 'BENEFICIÁRIO FINAL', 'MUNICÍPIO', 'QTD', 'VR UNITÁRIO', 'VR TOTAL', 'TOTAL A EMPENHAR', 'Total GND-3 · Custeio']) expect(html).toContain(h);
    expect(html).toContain('R$ 1.598,76<sup>¹</sup>');
    expect(html).toContain('(Kit Academia)');
    expect(html).toContain('>00043/2026</td><td style="border:1px solid #000;padding:4px 6px;text-align:center;">00005</td>');
    expect(html).not.toContain('ÓRGÃO');
    expect(html.match(/colspan="7"/g)).toHaveLength(3);
    expect(htmlParaSei(montarQuadro({ autor, linhas: [{ ...linhas[2], beneficiarioNome: '<b>x</b>' }], itens, beneficiarios: new Map(), precos, data: '2026-10-23' }))).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('WhatsApp: lista com negrito no total', () => {
    const t = textoParaWhatsapp(q);
    expect(t.split('\n')[0]).toBe('*Anexo I – Indicação de Romário (Senado Federal · RJ)*');
    expect(t).toContain('• 10 × Tablet\n  Ata 00043/2026 · item 00005\n  Secretaria de Estado de Polícia Militar do Rio de Janeiro — Rio de Janeiro - RJ\n  R$ 1.598,76 ¹ = *R$ 15.987,60*');
    expect(t).toContain('• 100 × Colchonete\n  Ata 00031/2025 · item 00001\n  beneficiário a definir');
    expect(t).toContain(`*TOTAL A EMPENHAR: R$ `);
  });
});

describe('títulos, nomes e notas', () => {
  it('título por tipo de autor', () => {
    expect(tituloDoAnexo({ tipo: 'BANCADA', uf: 'SP' } as AutorEmenda)).toBe('Anexo I – Indicação da Bancada do Estado de São Paulo');
    expect(tituloDoAnexo({ tipo: 'BANCADA', uf: 'DF' } as AutorEmenda)).toBe('Anexo I – Indicação da Bancada do Distrito Federal');
    expect(tituloDoAnexo({ tipo: 'DEPUTADO', nome: 'Fulano', uf: 'PR' } as AutorEmenda)).toBe('Anexo I – Indicação de Fulano (Câmara dos Deputados · PR)');
    expect(tituloDoAnexo(null)).toBe('Anexo I – Reserva de itens (parlamentar a definir)');
  });

  it('nome do item: nome curto, ou o começo da descrição', () => {
    expect(nomeDoItem(item('x', { nomeCurto: 'Fuzil' }), 'x')).toBe('Fuzil');
    expect(nomeDoItem(item('x', { descricao: 'TABLET, TELA SUPERIOR A 10 POL' }), 'x')).toBe('Tablet');
    expect(nomeDoItem(undefined, '00001/2025-200331-00001')).toBe('00001/2025-200331-00001');
  });

  it('nota do preço previsto', () => {
    expect(notaDoPreco(preco('x', { motivo: 'PREVISTO', efeito: '2027-03-01', percentual: 4.5, devido: true }))).toBe('Reajuste previsto a partir de 03/2027 (IPCA de 4,50%); inclui o reajuste já devido.');
    expect(notaDoPreco(preco('x', { motivo: 'SEM_PREVISAO' }))).toContain('considerar folga');
    expect(notaDoPreco(preco('x', { motivo: 'EM_DIA' }))).toBeNull();
    expect(notaDoPreco(undefined)).toBeNull();
  });
});
