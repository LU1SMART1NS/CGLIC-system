import { describe, expect, it } from 'vitest';
import { consertarTexto, lerNomesDosItens, limparNome, linhasDaTabelaDePrecos, pdfEhDaAta, type PaginaDoPdf } from '../nomeItemAtaParser';
import fixtures from './fixtures/nomeItemAta.json';

/**
 * Fixtures: pedaços de texto (x, y, largura, altura, texto) que o pdf.js tira de atas assinadas reais do PNCP, só na
 * região das tabelas. Preços do banco de 16/11/2026 (o de hoje, com reajuste). Os nomes esperados são os da carga
 * conferida pelo usuário (migration 312), salvo onde a carga errou (00036/2026, itens 3, 4 e 7).
 */
type Fixture = Array<Array<[number, number, number, number, string]>>;
const paginas = (nome: keyof typeof fixtures): PaginaDoPdf[] => (fixtures[nome] as Fixture).map((pg) => pg.map(([x, y, w, h, s]) => ({ x, y, w, h, s })));
const nomes = (r: ReturnType<typeof lerNomesDosItens>) => Object.fromEntries(r.nomes.map((n) => [n.numero, n.nome]));
const motivos = (r: ReturnType<typeof lerNomesDosItens>) => Object.fromEntries(r.semNome.map((n) => [n.numero, n.motivo]));

describe('texto do PDF', () => {
  it('o "ti" das fontes do SEI volta (caractere de controle no lugar)', () => {
    expect(consertarTexto('Jus\u0000ça e en\u001adade par\u0019cipante')).toBe('Justiça e entidade participante');
    expect(consertarTexto('h\u0000p://sei.mj.gov.br')).toBe('http://sei.mj.gov.br');
    // No fim da palavra o sinal é "tt".
    expect(consertarTexto('Banco Sco\u0000')).toBe('Banco Scott');
  });
});

describe('nome a partir da célula', () => {
  it('corta marca, modelo, códigos, prazo de 24 meses e preço', () => {
    expect(limparNome('Bota tática - Marca: Magnum Modelo: Raptor')).toBe('Bota tática');
    expect(limparNome('150913 - Arma de incapacitação neuromuscular CATMAT 150913')).toBe('Arma de incapacitação neuromuscular');
    expect(limparNome('Solução para Investigação em Dark Web com atualização e suporte por no mínimo 24 (vinte e quatro) meses')).toBe('Solução para Investigação em Dark Web');
    expect(limparNome('Manutenção do sequenciador 24 meses R$ 5.040,09')).toBe('Manutenção do sequenciador');
    // "código" no meio do nome não é código de catálogo.
    expect(limparNome('Placa com código de Barra (DW-Plate), para equipamento Hamilton')).toBe('Placa com código de Barra (DW-Plate), para equipamento Hamilton');
  });
  it('até 80 letras: corta no último detalhe ou espaço, sem preposição solta no fim', () => {
    const longo = limparNome('Veículo, tipo Camioneta/SUV, de médio porte, caracterizado, proteção balística parcial, motor flex de no mínimo 150 cv');
    expect(longo).toBe('Veículo, tipo Camioneta/SUV, de médio porte, caracterizado');
    expect(limparNome('Coletor de projéteis de alta energia em fibra de aramida para uso em laboratório de balística forense')).toBe(
      'Coletor de projéteis de alta energia em fibra de aramida para uso em laboratório'
    );
    expect((limparNome('x'.repeat(10) + ' ' + 'palavra '.repeat(20)) ?? '').length).toBeLessThanOrEqual(80);
  });
  it('em dúvida, não é nome: preço, total, só código, pedaço de outra célula', () => {
    expect(limparNome('R$ 1.977,60')).toBeNull();
    expect(limparNome('TOTAL GERAL')).toBeNull();
    expect(limparNome('619885')).toBeNull();
    expect(limparNome('mastro)')).toBeNull();
    expect(limparNome('MEDIDA Suporte de Mastro de 1 619885Unidade Bandeiras')).toBeNull();
  });
});

describe('tabela de preços da ata assinada', () => {
  it('48/2024 (PRF): célula no meio da linha, preço em dólar e em reais; vale o de reais', () => {
    const r = lerNomesDosItens(paginas('ata48de2024'), [{ numero: 1, valorUnitario: 312.98 }]);
    expect(nomes(r)).toEqual({ 1: 'BOTA TÁTICA' });
  });

  it('00036/2026: títulos partidos ("ITE"/"M"), números com zero, tabela que segue na outra página; tabelas dos participantes ficam de fora', () => {
    const itens = [
      [2, 247.5], [3, 287], [4, 111], [5, 142], [7, 75], [8, 40], [9, 50], [10, 15.2], [29, 92]
    ].map(([numero, valorUnitario]) => ({ numero, valorUnitario }));
    const r = lerNomesDosItens(paginas('ata36de2026'), itens);
    expect(nomes(r)).toEqual({
      2: 'Suporte de Mastro de Bandeiras (3 mastro)',
      3: 'Suporte de Mastro de Bandeira (4 mastro)',
      4: 'Mastro em alumínio de Bandeira',
      5: 'Mastro em madeira',
      // A carga de 16/11/2026 gravou "Mastro em madeira" aqui: o preço (R$ 75,00) confirma o Talabarte.
      7: 'Talabarte de Bandeira',
      8: 'Mini bandeira de mesa oficiais do Brasil e Estados',
      9: 'Bandeiras oficiais do Brasil, dos Estados e institucionais',
      10: 'Cachecol Branco',
      29: 'Toalha retangular'
    });
  });

  it('00024/2026: "IT"/"E"/"M" em três linhas, linha curta da célula ("aramida") alinhada à esquerda', () => {
    const r = lerNomesDosItens(paginas('ata24de2026'), [{ numero: 2, valorUnitario: 75000 }, { numero: 3, valorUnitario: 65650 }]);
    expect(nomes(r)).toEqual({
      2: 'Coletor de projéteis de alta energia, em fibra de aramida',
      3: 'Coletor de projéteis de baixa energia, em fibra de aramida'
    });
  });

  it('00005/2026 (manutenção): só "Item no TR"; vale quando o preço do banco aponta para a mesma linha', () => {
    const precos: Array<[number, number]> = [[1, 5040.09], [2, 8791.08], [4, 8330.91], [8, 13370.62]];
    const r = lerNomesDosItens(paginas('ata05de2026'), precos.map(([numero, valorUnitario]) => ({ numero, valorUnitario })));
    expect(nomes(r)).toEqual({
      1: 'Automate Nucleic Acid Extraction System (MA / MT / MS / MG)',
      2: '3500 Series Genetic Analyser for HID (AC / AP / CE / RO / RR / AM)',
      4: '3500 Series Genetic Analyser for HID (ES)',
      8: '3500XL Genetic Analyser for HID (MS)'
    });
    // Sem o preço, a numeração do TR não se confirma.
    const semPreco = lerNomesDosItens(paginas('ata05de2026'), [{ numero: 1, valorUnitario: null }]);
    expect(motivos(semPreco)).toEqual({ 1: 'numeração do TR sem o preço para confirmar' });
    // Preço de outra linha (o do item 2 no número 1): a numeração do TR não é a do PNCP.
    const trocado = lerNomesDosItens(paginas('ata05de2026'), [{ numero: 1, valorUnitario: 8791.08 }]);
    expect(nomes(trocado)).toEqual({});
  });

  it('00089/2024: "Item no TR" e "Item no PNCP"; vale a coluna do PNCP', () => {
    const { linhas } = linhasDaTabelaDePrecos(paginas('ata89de2024'));
    expect(linhas.map((l) => l.numero)).toEqual(expect.arrayContaining([13, 14, 15, 16, 17]));
    const r = lerNomesDosItens(paginas('ata89de2024'), [
      { numero: 13, valorUnitario: 805.98 },
      { numero: 16, valorUnitario: 9544.55 },
      { numero: 17, valorUnitario: 12720.42 }
    ]);
    expect(nomes(r)).toEqual({
      13: 'MicroAmp™ Fast Optical 96-Well Reaction Plate with Barcode',
      16: 'Conjunto Capilar, série 3500 de 8 Capilares x 36 cm',
      17: 'Conjunto Capilar, série 3500XL de 24 Capilares x 36 cm'
    });
    // Dois cartuchos que só diferem no fim (o equipamento): sem nome, para não confundir.
    const cartuchos = lerNomesDosItens(paginas('ata89de2024'), [{ numero: 9, valorUnitario: 24164.91 }, { numero: 11, valorUnitario: 3158.38 }]);
    expect(motivos(cartuchos)).toEqual({ 9: 'nome igual ao de outro item depois do corte', 11: 'nome igual ao de outro item depois do corte' });
  });

  it('00051/2024: células de várias linhas no meio da linha, coluna GRUPO, item que não existe e célula partida na troca de página', () => {
    const itens = [[1, 2438.27], [2, 113.94], [3, 28.48], [4, 188], [5, 0.0001], [7, 239.27], [8, 56.97]].map(([numero, valorUnitario]) => ({ numero, valorUnitario }));
    const r = lerNomesDosItens(paginas('ata51de2024'), itens);
    expect(nomes(r)).toMatchObject({
      1: 'Arma Eletroeletrônica de Incapacitação Neuromuscular',
      3: 'Cartucho inerte de treinamento',
      4: 'Bateria (modelo recarregável ou descartável)',
      7: 'Coldre em polímero resistente ou em Cordura com sistema MOLLE'
    });
    expect(motivos(r)).toMatchObject({ 5: 'item não está na tabela de preços', 8: 'célula do nome partida entre páginas' });
  });

  it('preço da linha muito longe do preço do item: não grava', () => {
    const r = lerNomesDosItens(paginas('ata24de2026'), [{ numero: 2, valorUnitario: 750 }]);
    expect(motivos(r)).toEqual({ 2: 'preço da linha não confere com o do item' });
  });

  it('PDF sem tabela de preços: nenhum nome', () => {
    const r = lerNomesDosItens(paginas('ata37de2026'), [{ numero: 1, valorUnitario: 10 }]);
    expect(r).toMatchObject({ nomes: [], tabelas: 0, semNome: [{ numero: 1, motivo: 'sem tabela de preços com coluna de nome' }] });
  });
});

describe('o PDF é da ata', () => {
  it('00037/2026: o PNCP publicou o PDF da ata 27/2026', () => {
    expect(pdfEhDaAta(paginas('ata37de2026'), '00037/2026')).toBe(false);
    expect(pdfEhDaAta(paginas('ata37de2026'), '00027/2026')).toBe(true);
  });
});
