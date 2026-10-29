import { describe, it, expect } from 'vitest';
import { brl, htmlDaTabela, montarQuadro, nomeDoItem, numeroEmEmoji, textoParaWhatsapp, tituloDoAnexo, type LinhaDoPedidoNoQuadro } from '../emendasQuadro';
import type { AutorEmenda, BeneficiarioEmenda, ItemCaep } from '../../services/emendasService';
import type { PrecoDoItem } from '../../services/emendasQuadroService';

const item = (k: string, extra: Partial<ItemCaep>): ItemCaep => ({
  itemKey: k, numeroAta: '00031/2025', codigoUasg: '200331', numeroItem: '00001', descricao: 'ITEM', codigoPdm: 1,
  valorUnitario: 100, vigenciaFinal: '2027-06-25', ataEncerrada: false, alocado: 100, nomeCurto: null, gnd: 'GND-4', ...extra
});
const preco = (k: string, extra: Partial<PrecoDoItem>): PrecoDoItem => ({
  itemKey: k, precoAtual: 100, dataReajuste: null, origem: null, devido: false, precoDevido: null, ...extra
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
  preco('suv', { precoAtual: 191811.62 }),
  preco('tablet', { precoAtual: 1528.8, origem: 'DEVIDO', devido: true, precoDevido: 1598.76 }),
  preco('drone', { precoAtual: 45200, dataReajuste: '2027-09-08', origem: 'PRORROGACAO' }),
  preco('colchonete', { precoAtual: 52, origem: 'DEVIDO', devido: true, precoDevido: 54.69 })
].map((p) => [p.itemKey, p]));
// Segunda-feira sem feriado na semana: 5 dias úteis = segunda seguinte.
const HOJE = '2026-11-09';
const linhas: LinhaDoPedidoNoQuadro[] = [
  { tipo: 'ITEM', itemKey: 'suv', kitNome: null, kitComposicao: null, quantidade: 5, beneficiarioId: 'b1' },
  { tipo: 'ITEM', itemKey: 'tablet', kitNome: null, kitComposicao: null, quantidade: 10, beneficiarioId: 'b1' },
  { tipo: 'ITEM', itemKey: 'drone', kitNome: null, kitComposicao: null, quantidade: 2, beneficiarioId: 'b2' },
  { tipo: 'KIT', itemKey: null, kitNome: 'Kit Academia', kitComposicao: [{ itemKey: 'mesa', quantidade: 1 }, { itemKey: 'leg', quantidade: 2 }], quantidade: 2, beneficiarioId: null },
  { tipo: 'ITEM', itemKey: 'colchonete', kitNome: null, kitComposicao: null, quantidade: 100, beneficiarioId: null }
];
const q = montarQuadro({ autor, linhas, itens, beneficiarios: new Map([['b1', pm], ['b2', cbm]]), precos, data: '2026-10-23', hoje: HOJE, emenda: { numero: '43600002', ano: 2026 } });

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
    const igual = montarQuadro({ autor, linhas: [linhas[0]], itens, beneficiarios: new Map([['b1', { ...pm, razaoSocial: '10º BATALHÃO DE POLÍCIA MILITAR', entregaLogradouro: null }]]), precos, data: '2026-10-23', hoje: HOJE });
    expect(igual.linhas[0]).toMatchObject({ razaoSocial: null, endereco: null });
    expect(q.semBeneficiario).toBe(3);
    expect(q.semNomeCurto).toBe(0);
  });

  it('valor unitário pelo preço de hoje, o mesmo do ofício e do empenho, sem notas de preço (migration 246)', () => {
    expect(q.linhas[1]).toMatchObject({ unitario: 1528.8, total: 15288 });
    expect(q.linhas[2]).toMatchObject({ unitario: 45200, total: 90400 });
    expect(q.linhas[5]).toMatchObject({ unitario: 52, total: 5200 });
    expect(q).not.toHaveProperty('notas');
    expect(q.linhas[0]).not.toHaveProperty('marca');
  });

  it('total a empenhar e total por GND quando mistura investimento e custeio', () => {
    const esperado = 959058.1 + 15288 + 90400 + 14723.8 + 32350.28 + 5200;
    expect(q.total).toBeCloseTo(esperado, 2);
    expect(q.porGnd).toEqual([
      { gnd: 'GND-4', rotulo: 'Total GND-4 · Investimento', total: Math.round((esperado - 5200) * 100) / 100 },
      { gnd: 'GND-3', rotulo: 'Total GND-3 · Custeio', total: 5200 }
    ]);
    const comSemGnd = montarQuadro({ autor, linhas: [linhas[0], linhas[4]], itens: new Map([...itens, ['suv', { ...itens.get('suv')!, gnd: null }]]), beneficiarios: new Map(), precos, data: '2026-10-23', hoje: HOJE });
    expect(comSemGnd.porGnd).toEqual([]);
    const tres = montarQuadro({ autor, linhas: [linhas[0], linhas[1], linhas[4]], itens: new Map([...itens, ['tablet', { ...itens.get('tablet')!, gnd: null }]]), beneficiarios: new Map(), precos, data: '2026-10-23', hoje: HOJE });
    expect(tres.porGnd.map((g) => g.rotulo)).toEqual(['Total GND-4 · Investimento', 'Total GND-3 · Custeio', 'Total sem GND informado']);
    expect(tres.porGnd.reduce((s, g) => s + g.total, 0)).toBeCloseTo(tres.total, 2);
    const so4 = montarQuadro({ autor, linhas: linhas.slice(0, 2), itens, beneficiarios: new Map(), precos, data: '2026-10-23', hoje: HOJE });
    expect(so4.porGnd).toEqual([]);
  });

  it('Tabela (Word e SEI, modelo de 29/10/2026): EMENDA numa célula só, beneficiário com sigla e razão social, item com ata embaixo, sem local de entrega, TOTAL A EMPENHAR (R$)', () => {
    const html = htmlDaTabela(q);
    for (const h of ['EMENDA', 'BENEFICIÁRIO', 'QUANT.', 'ITEM (OBJETO)', 'VALOR UNIT. (R$)', 'VALOR TOTAL (R$)', 'TOTAL A EMPENHAR (R$)', 'Total GND-3 · Custeio']) expect(html).toContain(h);
    expect(html).toContain(`<td rowspan="${q.linhas.length}" style="border:1px solid #000;padding:4px 6px;text-align:center;"><b>43600002</b></td>`);
    expect(html).not.toContain('LOCAL DE ENTREGA');
    expect(html).not.toContain('Rua X');
    expect(html.match(/<th /g)).toHaveLength(6);
    // Título embaixo da tabela; sem fonte, notas nem a marca da nota no preço.
    expect(html.startsWith('<table')).toBe(true);
    expect(html.endsWith('</tbody></table><p style="text-align:left;font-size:9pt;margin:2px 0 0">Tabela 1 – Indicação do(a) Senador(a) Romário (RJ)</p>')).toBe(true);
    expect(html).toContain('>1.528,80</td>');
    expect(html).not.toContain('R$ 1.528,80');
    expect(html).not.toContain('Kit Academia');
    expect(html).toContain('<b>Tablet</b><br><span style="font-size:8pt">Ata 00043/2026 · item 00005</span>');
    expect(html).toContain('<b>10º Batalhão de Polícia Militar</b> · <span style="white-space:nowrap">10º BPM</span><br><span style="font-size:8pt">RJ GOV POLICIA MILITAR</span>');
    expect(html).not.toContain('MUNICÍPIO');
    expect(html).not.toContain('ÓRGÃO');
    expect(html.match(/colspan="5"/g)).toHaveLength(3);
    expect(htmlDaTabela(montarQuadro({ autor, linhas: [linhas[2]], itens, beneficiarios: new Map([['b2', { ...cbm, nome: '<b>x</b>' }]]), precos, data: '2026-10-23', hoje: HOJE }))).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('WhatsApp: numerado por beneficiário com o valor dele; sem título, ata, endereço nem notas; a definir no fim', () => {
    const t = textoParaWhatsapp(q);
    expect(t.startsWith('📋 *Reserva de itens · ComprasSUSP/Senasp/MJSP · 23/10/2026*\n🏷️ *Emenda 4360 0002 / 2026*\n⏳ *Enviar o ofício até 16/11/2026*\n\n1️⃣ *10º Batalhão de Polícia Militar · 10º BPM* · Rio de Janeiro - RJ: *R$ 974.346,10*\n• 5 Camioneta/SUV médio: R$ 959.058,10\n• 10 Tablet: R$ 15.288,00\n\n')).toBe(true);
    expect(t).toContain('2️⃣ *Corpo de Bombeiros Militar · CBMERJ* · RJ: *R$ 90.400,00*\n• 2 Drone: R$ 90.400,00\n\n');
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
    expect(tituloDoAnexo({ tipo: 'DEPUTADO', nome: 'Fulano', uf: 'PR' } as AutorEmenda)).toBe('Tabela 1 – Indicação do(a) Deputado(a) Fulano (PR)');
    expect(tituloDoAnexo(null)).toBe('Tabela 1 – Reserva de itens (parlamentar a definir)');
    expect(tituloDoAnexo({ tipo: 'DEPUTADO', nome: 'Fulana', uf: 'SP', sexo: 'F' } as AutorEmenda)).toBe('Tabela 1 – Indicação da Deputada Fulana (SP)');
    expect(tituloDoAnexo({ tipo: 'DEPUTADO', nome: 'Fulano', uf: 'PR', sexo: 'M' } as AutorEmenda)).toBe('Tabela 1 – Indicação do Deputado Fulano (PR)');
    expect(tituloDoAnexo({ tipo: 'SENADOR', nome: 'Beltrana', uf: 'MS', sexo: 'F' } as AutorEmenda)).toBe('Tabela 1 – Indicação da Senadora Beltrana (MS)');
    expect(tituloDoAnexo({ tipo: 'SENADOR', nome: 'Romário', uf: 'RJ', sexo: 'M' } as AutorEmenda)).toBe('Tabela 1 – Indicação do Senador Romário (RJ)');
  });

  it('nome do item: nome curto, ou o começo da descrição', () => {
    expect(nomeDoItem(item('x', { nomeCurto: 'Fuzil' }), 'x')).toBe('Fuzil');
    expect(nomeDoItem(item('x', { descricao: 'TABLET, TELA SUPERIOR A 10 POL' }), 'x')).toBe('Tablet');
    expect(nomeDoItem(undefined, '00001/2025-200331-00001')).toBe('00001/2025-200331-00001');
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
  const qv = montarQuadro({ autor, linhas: varios, itens, beneficiarios: new Map([['b1', pm], ['b2', cbm]]), precos, data: '2026-10-23', hoje: HOJE });

  it('junta as linhas do item na ordem em que ele aparece; a primeira diz quantas são', () => {
    expect(qv.linhas.map((l) => [l.descricao, l.beneficiario, l.quantidade, l.linhasDoItem])).toEqual([
      ['Camioneta/SUV médio', '10º Batalhão de Polícia Militar', 2, 3],
      ['Camioneta/SUV médio', 'Corpo de Bombeiros Militar', 2, 0],
      ['Camioneta/SUV médio', null, 3, 0],
      ['Tablet', '10º Batalhão de Polícia Militar', 10, 1]
    ]);
    expect(qv.linhas[1].total).toBe(Math.round(2 * 191811.62 * 100) / 100);
    expect(qv.total).toBe(Math.round((7 * 191811.62 + 10 * 1528.8) * 100) / 100);
  });

  it('Tabela: item e valor unitário com rowspan, uma vez só', () => {
    const h = htmlDaTabela(qv);
    expect(h).toContain('rowspan="3"');
    expect(h.match(/Camioneta\/SUV médio/g)).toHaveLength(1);
  });

  it('WhatsApp: o mesmo item aparece em cada beneficiário', () => {
    const t = textoParaWhatsapp(qv);
    expect(t).toContain('*10º Batalhão de Polícia Militar · 10º BPM* · Rio de Janeiro - RJ: *R$ 398.911,24*\n• 2 Camioneta/SUV médio: R$ 383.623,24\n• 10 Tablet');
    expect(t).toContain('*Beneficiário a definir*: *R$ 575.434,86*\n• 3 Camioneta/SUV médio: R$ 575.434,86');
  });
});

describe('prazo do ofício', () => {
  it('5 dias úteis da minuta, ou antes, o reajuste menos o tempo até o contrato ou o prazo de indicação da ata; o gravado vale no lugar', () => {
    expect(q.prazoDoOficio).toEqual({ data: '2026-11-16', pela: 'MINUTA', ata: null });
    // Reajuste em 29/12/2026 − 45 dias = 14/11/2026, antes dos 5 dias úteis.
    const reajusta = new Map(precos).set('drone', preco('drone', { precoAtual: 45200, dataReajuste: '2026-12-29', origem: 'REAJUSTE' }));
    expect(montarQuadro({ autor, linhas, itens, beneficiarios: new Map(), precos: reajusta, data: '2026-10-23', hoje: HOJE }).prazoDoOficio).toEqual({ data: '2026-11-14', pela: 'REAJUSTE', ata: 'drone' });
    // Ata até 15/01/2027: indicação até 16/11/2026 (60 dias antes), menos 5 dias para a CAEP registrar = 11/11/2026.
    const perto = new Map(itens).set('drone', item('drone', { nomeCurto: 'Drone', valorUnitario: 45200, numeroAta: '00099/2024', vigenciaFinal: '2027-01-15' }));
    const q2 = montarQuadro({ autor, linhas, itens: perto, beneficiarios: new Map(), precos, data: '2026-10-23', hoje: HOJE });
    expect(q2.prazoDoOficio).toEqual({ data: '2026-11-11', pela: 'ATA', ata: '00099/2024' });
    expect(textoParaWhatsapp(q2)).toContain('⏳ *Enviar o ofício até 11/11/2026*');
    // Minuta registrada: vale o prazo gravado no banco.
    expect(montarQuadro({ autor, linhas, itens, beneficiarios: new Map(), precos, data: '2026-10-23', hoje: HOJE, prazoGravado: '2026-11-03' }).prazoDoOficio).toEqual({ data: '2026-11-03', pela: 'MINUTA', ata: null });
  });
});
