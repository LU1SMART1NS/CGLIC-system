import { describe, expect, it } from 'vitest';
import {
  copiaDosQuadros,
  emMoeda,
  faltaPreencher,
  formatoDoQuadro3,
  fornecedorDaAta,
  itensDaAta,
  itensQueNaoFecham,
  larguras,
  quadro1,
  quadro2,
  quadro3,
  quadros,
  tabelaHtml,
  tamanhoDaAta,
  type EntradaDosQuadros,
  type RascunhoDaAta
} from '../ataAMontarQuadros';
import type { ItemDaCompra, LeituraDaMinuta } from '../../services/atasAMontarSyncService';

const ITURRI = 'ESTRANG0000440';
const GOHOBBY = '13373898000438';

const resultado = (ni: string, q: number, vu: number) => ({
  fornecedor_ni: ni, fornecedor_nome: ni === ITURRI ? 'ITURRI S.A.' : 'GOHOBBY', quantidade: q, valor_unitario: vu, valor_total: q * vu,
  data_resultado: '2026-08-14', moeda_estrangeira: null, valor_moeda_estrangeira: null
});

// Pregão 90039/2025, item 3 (ata 43/2026): 16.896 conjuntos, gerenciador 1.540.
const ITENS: ItemDaCompra[] = [
  { numero: 2, descricao: 'Touca', unidade: 'Unidade', quantidade: 22733, situacao: null, catalogo_codigo: null, resultados: [resultado('ESTRANG0000486', 22733, 647.46)] },
  { numero: 3, descricao: 'Vestuário Proteção', unidade: 'Conjunto', quantidade: 16896, situacao: null, catalogo_codigo: null, resultados: [resultado(ITURRI, 16896, 1416.97)] }
];
const MINUTA: LeituraDaMinuta = {
  arquivo: 'minuta.pdf',
  modelo: 'A',
  avisos: [],
  itens: {
    '3': {
      descricao: 'Roupa de Combate a Incêndio Florestal',
      catmat: null,
      gerenciador: 1540,
      fecha: true,
      participantes: [
        { uasg: '927134', nome: 'CBMAP', quantidade: 1500 },
        { uasg: '170394', nome: 'CBMDF', quantidade: 2500 },
        { uasg: '927239', nome: 'CBMMA', quantidade: 0 },
        { uasg: '999999', nome: 'RESTO', quantidade: 11356 }
      ]
    }
  }
};

const entrada = (r: RascunhoDaAta = {}, ni = ITURRI): EntradaDosQuadros => {
  const itens = itensDaAta(ITENS, MINUTA, ni, r);
  return {
    itens,
    rascunho: r,
    fornecedorNi: ni,
    fornecedor: fornecedorDaAta(ni, 'ITURRI S.A.', r, null),
    nomeDoOrgao: (u) => ({ '927134': 'Corpo de Bombeiros Militar do Amapá', '170394': 'Corpo de Bombeiros Militar do DF' })[u] ?? `UASG ${u}`,
    gerenciadora: 'SENASP - UASG 200331 (BRASÍLIA/DF)'
  };
};

describe('itensDaAta', () => {
  it('só os itens do fornecedor, com descrição da minuta e quantidades que fecham com o homologado', () => {
    const itens = itensDaAta(ITENS, MINUTA, ITURRI, {});
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ numero: 3, descricao: 'Roupa de Combate a Incêndio Florestal', origemDescricao: 'MINUTA', catmat: '', origemCatmat: 'NENHUMA', gerenciador: 1540, homologada: 16896 });
    expect(itensQueNaoFecham(itens)).toEqual([]);
  });

  it('item sem minuta: descrição do PNCP e tudo no gerenciador', () => {
    const [i] = itensDaAta(ITENS, MINUTA, 'ESTRANG0000486', {});
    expect(i).toMatchObject({ descricao: 'Touca', origemDescricao: 'PNCP', gerenciador: 22733, participantes: [] });
  });

  it('correções do gestor: descrição, CATMAT, quantidade de um órgão e órgão acrescentado', () => {
    const [i] = itensDaAta(ITENS, MINUTA, ITURRI, {
      itens: { '3': { descricao: 'Roupa florestal', catmat: '123456' } },
      quantidades: { '3': { participantes: { '927134': 1400, '111111': 100 } } }
    });
    expect(i).toMatchObject({ descricao: 'Roupa florestal', origemDescricao: 'GESTOR', catmat: '123456', origemCatmat: 'GESTOR' });
    expect(i.participantes.find((p) => p.uasg === '927134')?.quantidade).toBe(1400);
    expect(i.participantes.at(-1)).toEqual({ uasg: '111111', quantidade: 100 });
  });

  it('tudo para o gerenciador: 1 por participante (0 continua 0) e o resto para a SENASP', () => {
    const [i] = itensDaAta(ITENS, MINUTA, ITURRI, { modo: 'GERENCIADOR' });
    expect(i.participantes.map((p) => p.quantidade)).toEqual([1, 1, 0, 1]);
    expect(i.gerenciador).toBe(16896 - 3);
  });
});

describe('quadros', () => {
  it('Quadro 1: fornecedor no topo, marca/modelo opcional e linha TOTAL', () => {
    const q = quadro1(entrada({ fornecedor: { representante: 'Fulano (36773561)' } }));
    expect(q.topo?.[0]).toEqual(['Empresa', 'ITURRI S.A.']);
    expect(q.topo?.[1][0]).toBe('CNPJ Internacional');
    expect(q.topo?.[5]).toEqual(['Representada no Brasil', 'Fulano (36773561)']);
    expect(q.cab).toContain('MARCA/MODELO');
    expect(q.linhas[0]).toEqual(['3', 'Roupa de Combate a Incêndio Florestal', '', '', 'Conjunto', '1.540', '15.356', '16.896', '1.416,97', '23.941.125,12']);
    expect(q.linhas.at(-1)).toEqual({ total: 'TOTAL', v: ['23.941.125,12'] });
    expect(quadro1(entrada({ marca: false })).cab).not.toContain('MARCA/MODELO');
  });

  it('Quadro 1: valor também na moeda da proposta da empresa estrangeira', () => {
    const r: RascunhoDaAta = { fornecedor: { moeda: '€' }, itens: { '3': { valorMoeda: '240,87' } } };
    const e = entrada(r);
    expect(emMoeda(ITURRI, r, e.itens[0]).vu).toBe(' (€ 240,87)');
    expect((quadro1(e).linhas[0] as string[]).at(-2)).toBe('1.416,97 (€ 240,87)');
  });

  it('Quadro 2: título da gerenciadora, mínima de 10% e unidades sob QUANTIDADE', () => {
    const q = quadro2(entrada({ unidades: ['CAEP', 'DFNSP'], divisao: { '3': { CAEP: 540, DFNSP: 1000 } } }));
    expect(q.tituloDaTabela).toBe('SENASP - UASG 200331 (BRASÍLIA/DF)');
    expect(q.cab).toEqual(['ITEM', 'DESCRIÇÃO', 'UND', 'QTD MÍNIMA', 'CAEP', 'DFNSP', 'TOTAL']);
    expect(q.grupo).toEqual({ ini: 4, n: 2, rotulo: 'QUANTIDADE' });
    expect(q.linhas[0]).toEqual(['3', 'Roupa de Combate a Incêndio Florestal', 'Conjunto', '154', '540', '1.000', '1.540']);
  });

  it('Quadro 3: um item abre em lista, com mínima, "-" quando o órgão tem 0 e total do item', () => {
    const e = entrada();
    expect(formatoDoQuadro3(e)).toBe('LISTA');
    const q = quadro3(e);
    expect(q.cab).toEqual(['ÓRGÃO PARTICIPANTE', 'UASG', 'ITEM', 'DESCRIÇÃO', 'QTD MÍNIMA', 'QTD']);
    expect(q.linhas[0]).toEqual(['Corpo de Bombeiros Militar do Amapá', '927134', '3', 'Roupa de Combate a Incêndio Florestal', '150', '1.500']);
    expect(q.linhas[2]).toEqual(['UASG 927239', '927239', '3', 'Roupa de Combate a Incêndio Florestal', '-', '-']);
    expect(q.linhas.at(-1)).toEqual({ total: 'TOTAL DO ITEM 3', v: ['15.356'] });
  });

  it('Quadro 3 em grade, quando o gestor escolhe: cada órgão uma vez e a mínima embaixo', () => {
    const q = quadro3(entrada({ formato3: 'GRADE' }));
    expect(q.cab).toEqual(['ÓRGÃO PARTICIPANTE', 'UASG', 'ITEM 3']);
    expect(q.linhas[0]).toEqual(['Corpo de Bombeiros Militar do Amapá', '927134', '1.500\nmín. 150']);
    expect(q.legenda).toEqual(['Item 3: Roupa de Combate a Incêndio Florestal (Conjunto)']);
  });

  it('tudo para o gerenciador: Quadro 2 e 3 sem a coluna de mínima', () => {
    const e = entrada({ modo: 'GERENCIADOR', unidades: ['CAEP'] });
    expect(quadro2(e).cab).toEqual(['ITEM', 'DESCRIÇÃO', 'UND', 'CAEP', 'TOTAL']);
    expect(quadro3(e).cab).toEqual(['ITEM', 'ÓRGÃO PARTICIPANTE', 'UASG', 'UND', 'QTD']);
    // Órgão com 0 fica fora da lista.
    expect(quadro3(e).linhas.filter(Array.isArray)).toHaveLength(3);
  });
});

describe('cópia para o SEI', () => {
  it('os três quadros saem no mesmo tamanho de letra: o maior em que todos cabem', () => {
    // Como no protótipo: a ITURRI sai em 10 pt sem marca/modelo e em 9 pt com a coluna a mais.
    expect(tamanhoDaAta(quadros(entrada()))).toBe(9);
    const qs = quadros(entrada({ marca: false }));
    expect(tamanhoDaAta(qs)).toBe(10);
    const { html, texto } = copiaDosQuadros([qs[0]], qs);
    expect(html).toContain('<thead>');
    expect(html).toContain('font-size:10pt');
    expect(html).toContain('<b>Empresa:</b> ITURRI S.A.');
    // Número não quebra: espaço vira &nbsp; e a mínima vai para a linha de baixo.
    expect(texto.split('\n')[0]).toBe('Quadro 1');
  });

  it('larguras somam 100% e diminuem a letra quando não cabe', () => {
    const cab = ['ITEM', 'DESCRIÇÃO', ...Array.from({ length: 14 }, (_, i) => `ITEM ${i + 1}`)];
    const L = larguras(cab, [cab.map(() => '999.999.999')]);
    expect(L.pt).toBe(8);
    expect(L.cabe).toBe(false);
    expect(Math.round(L.pct.reduce((s, v) => s + v, 0))).toBe(100);
  });

  it('linha de total mesclada e cabeçalho com hífen opcional', () => {
    const html = tabelaHtml(quadro1(entrada()), 10);
    expect(html).toContain('GEREN&shy;CIADOR');
    expect(html).toMatch(/<td colspan="9"[^>]*font-weight:bold;text-align:right">TOTAL<\/td>/);
  });
});

describe('faltaPreencher', () => {
  it('lista o que está em branco sem impedir a cópia', () => {
    expect(faltaPreencher(entrada())).toEqual(['CNPJ no Brasil', 'endereço', 'telefone', 'e-mail', 'representante', 'marca/modelo do item 3', 'CATMAT do item 3', 'unidades internas (Quadro 2)']);
  });

  it('divisão das unidades que não soma o gerenciador', () => {
    const f = faltaPreencher(entrada({ unidades: ['CAEP'], divisao: { '3': { CAEP: 1000 } } }));
    expect(f).toContain('divisão entre as unidades do item 3');
  });

  it('fornecedor nacional: dados da Receita preenchem endereço, telefone e e-mail', () => {
    const f = fornecedorDaAta(GOHOBBY, 'GOHOBBY', {}, {
      razaoSocial: 'GOHOBBY FUTURE TECHNOLOGY LTDA', situacaoCadastral: 'ATIVA', sedeEndereco: 'Rua X, 10, Centro', sedeMunicipio: 'São Paulo', sedeUf: 'SP', sedeCep: '01001000', sedeTelefone: '(11) 3333-4444', sedeEmail: 'CONTATO@X.COM'
    });
    expect(f).toMatchObject({ estrangeiro: false, cnpj: '13.373.898/0004-38', endereco: 'Rua X, 10, Centro, São Paulo - SP · CEP 01001-000', telefone: '(11) 3333-4444', email: 'contato@x.com' });
    // Estrangeira: o endereço é o do exterior, da proposta (a Receita traz "NÃO INFORMADO").
    expect(fornecedorDaAta(ITURRI, 'ITURRI S.A.', { fornecedor: { cnpjBrasil: '05734043000114' } }, {
      razaoSocial: 'ITURRI S.A.', situacaoCadastral: 'ATIVA', sedeEndereco: 'NAO INFORMADO, S/N', sedeMunicipio: null, sedeUf: null, sedeCep: null, sedeTelefone: null, sedeEmail: null
    })).toMatchObject({ endereco: '', cnpj: '05.734.043/0001-14', empresa: 'ITURRI S.A.' });
    // Campo trocado pelo gestor vale por cima da Receita, mesmo vazio.
    expect(fornecedorDaAta(GOHOBBY, 'GOHOBBY', { fornecedor: { telefone: '' } }, null).telefone).toBe('');
  });
});
