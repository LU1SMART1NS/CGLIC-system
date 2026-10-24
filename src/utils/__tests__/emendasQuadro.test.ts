import { describe, it, expect } from 'vitest';
import { brl, htmlDaTabela, montarQuadro, nomeDoItem, notaDoPreco, numeroEmEmoji, textoParaWhatsapp, tituloDoAnexo, type LinhaDoPedidoNoQuadro } from '../emendasQuadro';
import type { AutorEmenda, BeneficiarioEmenda, ItemCaep } from '../../services/emendasService';
import type { PrecoPrevisto } from '../../services/emendasQuadroService';

const item = (k: string, extra: Partial<ItemCaep>): ItemCaep => ({
  itemKey: k, numeroAta: '00031/2025', codigoUasg: '200331', numeroItem: '00001', descricao: 'ITEM', codigoPdm: 1,
  valorUnitario: 100, vigenciaFinal: '2027-06-25', ataEncerrada: false, alocado: 100, nomeCurto: null, gnd: 'GND-4', ...extra
});
const preco = (k: string, extra: Partial<PrecoPrevisto>): PrecoPrevisto => ({
  itemKey: k, precoAtual: 100, precoPrevisto: 100, motivo: 'EM_DIA', devido: false, efeito: null, percentual: null, mesesEstimados: null, ...extra
});
const pm = {
  id: 'b1', nome: '10º Batalhão de Polícia Militar', sigla: '10º BPM', razaoSocial: 'RJ GOV POLICIA MILITAR', entregaMunicipio: 'Rio de Janeiro', entregaUf: 'RJ',
  entregaLogradouro: 'Rua X', entregaNumero: '100', entregaComplemento: null, entregaBairro: 'Centro', entregaCep: '20000000'
} as BeneficiarioEmenda;
const cbm = { id: 'b2', nome: 'Corpo de Bombeiros Militar', sigla: 'CBMERJ', razaoSocial: null, entregaMunicipio: null, entregaUf: 'RJ' } as BeneficiarioEmenda;
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
  { tipo: 'ITEM', itemKey: 'drone', kitNome: null, kitComposicao: null, quantidade: 2, beneficiarioId: 'b2' },
  { tipo: 'KIT', itemKey: null, kitNome: 'Kit Academia', kitComposicao: [{ itemKey: 'mesa', quantidade: 1 }, { itemKey: 'leg', quantidade: 2 }], quantidade: 2, beneficiarioId: null },
  { tipo: 'ITEM', itemKey: 'colchonete', kitNome: null, kitComposicao: null, quantidade: 100, beneficiarioId: null }
];
const q = montarQuadro({ autor, linhas, itens, beneficiarios: new Map([['b1', pm], ['b2', cbm]]), precos, data: '2026-10-23' });

describe('quadro da reserva (Anexo)', () => {
  it('uma linha por item, kit aberto nos seus itens com a quantidade de kits', () => {
    expect(q.linhas.map((l) => [l.descricao, l.quantidade])).toEqual([
      ['Camioneta/SUV médio', 5],
      ['Tablet', 10],
      ['Drone', 2],
      ['Mesa flexora', 2],
      ['Leg press 45°', 4],
      ['Colchonete', 100]
    ]);
  });

  it('beneficiário: nome, sigla e razão social; entrega: cidade e endereço; ou a definir', () => {
    expect(q.linhas[0]).toMatchObject({
      beneficiario: '10º Batalhão de Polícia Militar', sigla: '10º BPM', razaoSocial: 'RJ GOV POLICIA MILITAR',
      entrega: 'Rio de Janeiro - RJ', endereco: 'Rua X, 100 · Centro · CEP 20000-000'
    });
    expect(q.linhas[0]).not.toHaveProperty('orgao');
    expect(q.linhas[2]).toMatchObject({ beneficiario: 'Corpo de Bombeiros Militar', sigla: 'CBMERJ', razaoSocial: null, entrega: 'RJ', endereco: null });
    const igual = montarQuadro({ autor, linhas: [linhas[0]], itens, beneficiarios: new Map([['b1', { ...pm, razaoSocial: '10º BATALHÃO DE POLÍCIA MILITAR', entregaLogradouro: null }]]), precos, data: '2026-10-23' });
    expect(igual.linhas[0]).toMatchObject({ razaoSocial: null, endereco: null });
    expect(q.semEndereco).toBe(1);
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

  it('Tabela (Word e SEI): 6 colunas, item com ata embaixo, beneficiário com sigla e razão social, entrega com endereço e TOTAL A EMPENHAR', () => {
    const html = htmlDaTabela(q);
    for (const h of ['ITEM', 'BENEFICIÁRIO FINAL', 'LOCAL DE ENTREGA', 'QTD', 'VR UNITÁRIO', 'VR TOTAL', 'TOTAL A EMPENHAR', 'Total GND-3 · Custeio']) expect(html).toContain(h);
    expect(html.match(/<th /g)).toHaveLength(6);
    // Documento oficial: título em cima, fonte e notas embaixo.
    expect(html.indexOf('Tabela 1 – Indicação de Romário')).toBeLessThan(html.indexOf('<table'));
    expect(html.indexOf('Fonte: ComprasSUSP/SENASP/MJSP, reserva de itens de 23/10/2026.')).toBeGreaterThan(html.indexOf('</table>'));
    expect(html).toContain('Notas:<br>¹ ');
    expect(html).toContain('R$ 1.598,76<sup>¹</sup>');
    expect(html).not.toContain('Kit Academia');
    expect(html).toContain('<b>Tablet</b><br><span style="font-size:8pt">Ata 00043/2026 · item 00005</span>');
    expect(html).toContain('<b>10º Batalhão de Polícia Militar</b> · <span style="white-space:nowrap">10º BPM</span><br><span style="font-size:8pt">RJ GOV POLICIA MILITAR</span>');
    expect(html).toContain('<b>Rio de Janeiro - RJ</b><br><span style="font-size:8pt">Rua X, 100 · Centro · CEP 20000-000</span>');
    expect(html).not.toContain('MUNICÍPIO');
    expect(html).not.toContain('ÓRGÃO');
    expect(html.match(/colspan="5"/g)).toHaveLength(3);
    expect(htmlDaTabela(montarQuadro({ autor, linhas: [linhas[2]], itens, beneficiarios: new Map([['b2', { ...cbm, nome: '<b>x</b>' }]]), precos, data: '2026-10-23' }))).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('WhatsApp: numerado por beneficiário com o valor dele; sem título, ata, endereço nem notas; a definir no fim', () => {
    const t = textoParaWhatsapp(q);
    expect(t.startsWith('📋 *Reserva de itens · ComprasSUSP/Senasp/MJSP · 23/10/2026*\n⏳ *Enviar o ofício até 22/11/2026*\n\n1️⃣ *10º Batalhão de Polícia Militar · 10º BPM* · Rio de Janeiro - RJ: *R$ 975.045,70*\n• 5 Camioneta/SUV médio: R$ 959.058,10\n• 10 Tablet: R$ 15.987,60\n\n')).toBe(true);
    expect(t).toContain('2️⃣ *Corpo de Bombeiros Militar · CBMERJ* · RJ: *R$ 94.317,66*\n• 2 Drone\n\n');
    expect(t).toContain('3️⃣ *Beneficiário a definir*');
    for (const fora of ['Tabela 1', 'Ata ', 'Rua X', 'IPCA', '¹']) expect(t).not.toContain(fora);
    expect(t).toContain('• 2 Mesa flexora:');
    expect(t.endsWith(`💰 *Total: ${brl(q.total)}*`)).toBe(true);
    expect(numeroEmEmoji(12)).toBe('1️⃣2️⃣');
  });
});

describe('títulos, nomes e notas', () => {
  it('título por tipo de autor', () => {
    expect(tituloDoAnexo({ tipo: 'BANCADA', uf: 'SP' } as AutorEmenda)).toBe('Tabela 1 – Indicação da Bancada do Estado de São Paulo');
    expect(tituloDoAnexo({ tipo: 'BANCADA', uf: 'DF' } as AutorEmenda)).toBe('Tabela 1 – Indicação da Bancada do Distrito Federal');
    expect(tituloDoAnexo({ tipo: 'DEPUTADO', nome: 'Fulano', uf: 'PR' } as AutorEmenda)).toBe('Tabela 1 – Indicação de Fulano (Câmara dos Deputados · PR)');
    expect(tituloDoAnexo(null)).toBe('Tabela 1 – Reserva de itens (parlamentar a definir)');
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

describe('mesmo item para vários beneficiários', () => {
  const varios: LinhaDoPedidoNoQuadro[] = [
    { tipo: 'ITEM', itemKey: 'suv', kitNome: null, kitComposicao: null, quantidade: 2, beneficiarioId: 'b1' },
    { tipo: 'ITEM', itemKey: 'tablet', kitNome: null, kitComposicao: null, quantidade: 10, beneficiarioId: 'b1' },
    { tipo: 'ITEM', itemKey: 'suv', kitNome: null, kitComposicao: null, quantidade: 1, beneficiarioId: 'b2' },
    { tipo: 'ITEM', itemKey: 'suv', kitNome: null, kitComposicao: null, quantidade: 3, beneficiarioId: null },
    // O mesmo item vindo de kit soma com o avulso do mesmo beneficiário.
    { tipo: 'KIT', itemKey: null, kitNome: 'Kit Patrulha', kitComposicao: [{ itemKey: 'suv', quantidade: 1 }], quantidade: 1, beneficiarioId: 'b2' }
  ];
  const qv = montarQuadro({ autor, linhas: varios, itens, beneficiarios: new Map([['b1', pm], ['b2', cbm]]), precos, data: '2026-10-23' });

  it('junta as linhas do item na ordem em que ele aparece; a primeira diz quantas são', () => {
    expect(qv.linhas.map((l) => [l.descricao, l.beneficiario, l.quantidade, l.linhasDoItem])).toEqual([
      ['Camioneta/SUV médio', '10º Batalhão de Polícia Militar', 2, 3],
      ['Camioneta/SUV médio', 'Corpo de Bombeiros Militar', 2, 0],
      ['Camioneta/SUV médio', null, 3, 0],
      ['Tablet', '10º Batalhão de Polícia Militar', 10, 1]
    ]);
    expect(qv.linhas[1].total).toBe(Math.round(2 * 191811.62 * 100) / 100);
    expect(qv.total).toBe(Math.round((7 * 191811.62 + 10 * 1598.76) * 100) / 100);
  });

  it('Tabela: item e valor unitário com rowspan, uma vez só', () => {
    const h = htmlDaTabela(qv);
    expect(h).toContain('rowspan="3"');
    expect(h.match(/Camioneta\/SUV médio/g)).toHaveLength(1);
  });

  it('WhatsApp: o mesmo item aparece em cada beneficiário', () => {
    const t = textoParaWhatsapp(qv);
    expect(t).toContain('*10º Batalhão de Polícia Militar · 10º BPM* · Rio de Janeiro - RJ: *R$ 399.610,84*\n• 2 Camioneta/SUV médio: R$ 383.623,24\n• 10 Tablet');
    expect(t).toContain('*Beneficiário a definir*: *R$ 575.434,86*\n• 3 Camioneta/SUV médio');
  });
});

describe('preço pelo empenho provável (90 dias)', () => {
  it('reajuste até o empenho entra; depois dele, preço de hoje; sem base, folga do IPCA; devido sempre', async () => {
    const { aplicarPrazoDoEmpenho } = await import('../emendasQuadro');
    const ipca = { percentual: 4.5, de: '2025-10-01', ate: '2026-09-01' };
    const m = aplicarPrazoDoEmpenho(
      new Map([
        ['perto', preco('perto', { precoAtual: 100, precoPrevisto: 104, motivo: 'PREVISTO', efeito: '2027-01-01', percentual: 4 })],
        ['longe', preco('longe', { precoAtual: 100, precoPrevisto: 104, motivo: 'SE_PRORROGAR', efeito: '2027-03-01', percentual: 4 })],
        ['devido', preco('devido', { precoAtual: 100, precoPrevisto: 110, motivo: 'PREVISTO', devido: true, efeito: '2027-06-01', percentual: 5 })],
        ['sembase', preco('sembase', { precoAtual: 200, precoPrevisto: 200, motivo: 'SEM_PREVISAO' })],
        ['emdia', preco('emdia', { precoAtual: 50, precoPrevisto: 50, motivo: 'EM_DIA' })]
      ]),
      '2026-10-24',
      ipca
    );
    expect(m.get('perto')).toMatchObject({ precoPrevisto: 104, motivo: 'PREVISTO' });
    expect(m.get('longe')).toMatchObject({ precoPrevisto: 100, motivo: 'FORA_DO_PRAZO' });
    expect(m.get('devido')).toMatchObject({ precoPrevisto: 110 });
    expect(m.get('sembase')).toMatchObject({ precoPrevisto: 209, motivo: 'FOLGA_IPCA', percentual: 4.5 });
    expect(m.get('emdia')).toMatchObject({ precoPrevisto: 50 });
    expect(notaDoPreco(m.get('sembase'), ipca)).toBe('Ata sem data-base de reajuste informada: folga do IPCA dos últimos 12 meses (4,50%, 10/2025 a 09/2026).');
    expect(notaDoPreco(m.get('longe'))).toBeNull();
    // Sem o IPCA, o item sem base fica como estava (preço de hoje com o aviso).
    expect(aplicarPrazoDoEmpenho(new Map([['sembase', preco('sembase', { precoAtual: 200, precoPrevisto: 200, motivo: 'SEM_PREVISAO' })]]), '2026-10-24', null).get('sembase')?.motivo).toBe('SEM_PREVISAO');
  });
});

describe('prazo do ofício', () => {
  it('reserva + 30 dias, ou antes, o prazo de indicação da ata que termina primeiro', () => {
    expect(q.prazoDoOficio).toEqual({ data: '2026-11-22', pela: 'RESERVA', ata: null });
    const perto = new Map(itens).set('drone', item('drone', { nomeCurto: 'Drone', valorUnitario: 45200, numeroAta: '00099/2024', vigenciaFinal: '2026-12-10' }));
    const q2 = montarQuadro({ autor, linhas, itens: perto, beneficiarios: new Map(), precos, data: '2026-10-23' });
    // 10/12/2026 − 35 dias = 05/11/2026, menos 5 dias para a CAEP registrar = 31/10/2026, antes de 22/11.
    expect(q2.prazoDoOficio).toEqual({ data: '2026-10-31', pela: 'ATA', ata: '00099/2024' });
    expect(textoParaWhatsapp(q2)).toContain('⏳ *Enviar o ofício até 31/10/2026*');
    // Ofício devolvido: os 30 dias contam da devolução.
    expect(montarQuadro({ autor, linhas, itens, beneficiarios: new Map(), precos, data: '2026-09-01', devolvidoEm: '2026-10-20' }).prazoDoOficio?.data).toBe('2026-11-19');
  });
});
