import { describe, expect, it } from 'vitest';
import {
  AGRUPADORES,
  baseSiafiDaResposta,
  botoesDosAgrupadores,
  campoDoCabecalho,
  grupoComDados,
  infoDaTabela,
  lerEmendasDoPainel,
  lerPagina,
  lerXml,
  montarTabela,
  valorDoPainel
} from '../siopPainelQlik';
import { gravarLeitura, LOTE_DE_GRAVACAO, resumoDaLeitura, testarEmendasDoPainelSiop } from '../emendasPainelSiopSyncService';

// Respostas reais do painel (HAR de 03/11/2026), sem os estilos e com só os atributos lidos.
const ARQUIVOS = import.meta.glob('./fixtures/siop/*.xml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const ABRIR = ARQUIVOS['./fixtures/siop/abrir-sessao.xml'];
const POLL_EMENDAS = ARQUIVOS['./fixtures/siop/poll-aba-emendas.xml'];
const POLL_MENU = ARQUIVOS['./fixtures/siop/poll-menu-inicial.xml'];
const PAGINA_40 = ARQUIVOS['./fixtures/siop/pagina-40.xml'];
const PAGINA_80 = ARQUIVOS['./fixtures/siop/pagina-80.xml'];
/** Botões e rótulos do Passo 2 com as posições na tela. */
const AGRUPADORES_XML = ARQUIVOS['./fixtures/siop/agrupadores.xml'].replace(/^<agrupadores>|<\/agrupadores>$/g, '');

/** Botão de cada agrupador no HAR (o que fica à esquerda do rótulo). */
const BOTAO: Record<string, string> = {
  'Por Autor da Emenda': '87', 'Por Tipo de Autor': '88', 'Por Partido': '81',
  'Por UF do Autor': '103', 'Por Número de Emenda': '90', 'Por Órgão Orçamentário': '89',
  'Por Unidade Orçamentária': '101', 'Por Ação': '91', 'Por Localizador': '93',
  'Por GND': '100', 'Por Modalidade': '96', 'Por Natureza de Despesa': '95'
};

/**
 * Painel falso: guarda os comandos e responde com as fixtures. A tabela tem 120 linhas; cada agrupador ligado é uma
 * coluna a mais (o painel abre com os seis do HAR ligados = 13 colunas). Clicar num botão troca o agrupador.
 */
function painelFalso(opts: { ligados?: string[]; menuPrimeiro?: boolean; status?: number; corpo?: string } = {}) {
  const ligados = new Set((opts.ligados ?? ['Por Autor da Emenda', 'Por Tipo de Autor', 'Por Número de Emenda', 'Por Órgão Orçamentário', 'Por Ação', 'Por Modalidade']).map((r) => BOTAO[r]));
  const chamadas: Array<{ url: string; corpo: string; cookie: string }> = [];
  let menu = Boolean(opts.menuPrimeiro);
  let limpo = false;
  const tamanho = (xml: string) => xml.replace('totalsize="13:562"', `totalsize="${7 + ligados.size}:120"`);
  const comAgrupadores = (xml: string) => xml.replace('<object name="Document">', `<object name="Document">${AGRUPADORES_XML}`);
  const fetcher = (async (url: string, init?: RequestInit) => {
    const corpo = String(init?.body ?? '');
    chamadas.push({ url, corpo, cookie: String((init?.headers as Record<string, string>)?.cookie ?? '') });
    if (opts.status) return new Response(opts.corpo ?? '', { status: opts.status });
    let texto = ABRIR;
    const clique = corpo.match(/<set name="Document\.(\d+)\.Content"/);
    if (corpo.includes('CLEARSTATE')) limpo = true;
    else if (clique) {
      if (clique[1] === '20') menu = false;
      else if (ligados.has(clique[1])) ligados.delete(clique[1]);
      else ligados.add(clique[1]);
    } else if (corpo.includes('<poll ')) texto = menu ? POLL_MENU : tamanho(comAgrupadores(POLL_EMENDAS));
    else {
      const m = corpo.match(/<get name="79" offset="0:(\d+)"/);
      if (m) texto = tamanho(({ 0: POLL_EMENDAS, 40: PAGINA_40, 80: PAGINA_80 } as Record<string, string>)[m[1]]);
    }
    return new Response(texto, { status: 200 });
  }) as unknown as typeof fetch;
  return { fetcher, chamadas, ligados, foiLimpo: () => limpo };
}

describe('XML do painel do SIOP', () => {
  it('lê tags aninhadas, atributos e entidades', () => {
    const r = lerXml('<?xml version="1.0"?><result mark="AB"><group name="1"><value name="C0"><element text="A &amp; B&#xA;"/></value></group></result>');
    expect(r.tag).toBe('result');
    expect(r.atributos.mark).toBe('AB');
    expect(r.filhos[0].filhos[0].filhos[0].atributos.text).toBe('A & B\n');
  });

  it('acha a tabela das emendas pelo id do .qvw e o tamanho dela', () => {
    expect(infoDaTabela(lerXml(POLL_EMENDAS))).toEqual({ nome: '79', colunas: 13, linhas: 562, porPagina: 40 });
    expect(infoDaTabela(lerXml(POLL_MENU))).toBeNull();
  });

  it('acha o botão de cada um dos doze agrupadores pela posição ao lado do rótulo', () => {
    const mapa = botoesDosAgrupadores(lerXml(`<result>${AGRUPADORES_XML}</result>`));
    expect(Object.fromEntries(mapa)).toEqual(BOTAO);
    expect(mapa.size).toBe(AGRUPADORES.length);
  });

  it('lê uma página: cabeçalhos, linha 0 = Total e as células mescladas repetidas em cada linha', () => {
    const p = lerPagina(grupoComDados(lerXml(POLL_EMENDAS), '79')!);
    expect(p.cabecalhos).toEqual([
      'Ano', 'RP', 'Autor', 'Tipo Autor', 'Nro. Emenda', 'Órgão', 'Ação', 'Modalidade',
      'Dotação Inicial Emenda', 'Dotação Atual Emenda', 'Empenhado', 'Liquidado', 'Pago'
    ]);
    expect([...p.linhas.keys()]).toEqual(Array.from({ length: 40 }, (_, i) => i));
    expect(p.linhas.get(0)!.slice(0, 2)).toEqual(['Total', '']);
    expect(p.linhas.get(1)!.slice(2, 5)).toEqual(['Adolfo Viana', 'Deputado Federal', '38980002']);
    expect(Math.min(...lerPagina(grupoComDados(lerXml(PAGINA_40), '79')!).linhas.keys())).toBe(40);
  });

  it('valores em R$ 1,00 do painel e a data da base SIAFI', () => {
    expect(valorDoPainel('892.102.597')).toBe(892102597);
    expect(valorDoPainel('1.234,50')).toBe(1234.5);
    expect(valorDoPainel('')).toBeNull();
    expect(valorDoPainel('-')).toBeNull();
    expect(baseSiafiDaResposta(POLL_EMENDAS)).toBe('2026-10-30');
    expect(baseSiafiDaResposta(ABRIR)).toBeNull();
  });
});

describe('linhas das emendas', () => {
  it('reconhece as colunas dos agrupadores pelo cabeçalho', () => {
    expect(['Partido', 'UF', 'UF do Autor', 'Unidade Orçamentária', 'Localizador', 'GND', 'Natureza de Despesa', 'Modalidade', 'Órgão', 'Ação', 'Nro. Emenda'].map(campoDoCabecalho)).toEqual([
      'partido', 'uf', 'uf', 'unidade_orcamentaria', 'localizador', 'gnd', 'natureza_despesa', 'modalidade', 'orgao', 'acao', 'emenda'
    ]);
    expect(campoDoCabecalho('Tipo Autor')).toBe('tipo_autor');
    expect(campoDoCabecalho('Autor')).toBe('autor');
  });

  const cab = ['Ano', 'RP', 'Autor', 'Nro. Emenda', 'Órgão', 'Ação', 'GND', 'Localizador', 'Dotação Inicial Emenda', 'Dotação Atual Emenda', 'Empenhado', 'Liquidado', 'Pago'];
  const linha = (emenda: string, gnd: string, v: string) => ['2026', '6 - Emendas Individuais', 'Fulano', emenda, '30000 - MJSP', '2723 - Policiamento', gnd, '0001 - Nacional', v, v, v, '0', '0'];

  it('chave pela emenda e todas as dimensões; confere com o Total e junta só linhas idênticas', () => {
    const t = montarTabela(cab, new Map([
      [0, ['Total', '', '', '', '', '', '', '', '3.500', '3.500', '3.500', '0', '0']],
      [1, linha('42650013', '3', '1.000')],
      [2, linha('42650013', '3', '500')],
      [3, linha('42650013', '4', '2.000')]
    ]));
    expect(t.divergencias).toEqual([]);
    expect(t.linhas).toHaveLength(2);
    expect(t.linhas[0]).toMatchObject({
      ano: 2026, emenda: '42650013', gnd: '3', localizador: '0001 - Nacional', partido: null, dotacao_atual: 1500,
      chave: '42650013|6 - Emendas Individuais|Fulano|30000 - MJSP|2723 - Policiamento|3|0001 - Nacional'
    });
    expect(t.linhas[0].dimensoes).toEqual({ Ano: '2026', RP: '6 - Emendas Individuais', Autor: 'Fulano', 'Nro. Emenda': '42650013', Órgão: '30000 - MJSP', Ação: '2723 - Policiamento', GND: '3', Localizador: '0001 - Nacional' });
    expect(t.linhas[1].gnd).toBe('4');
  });

  it('aponta quando a soma não bate com o Total', () => {
    const t = montarTabela(cab, new Map([
      [0, ['Total', '', '', '', '', '', '', '', '9.999', '1.000', '1.000', '0', '0']],
      [1, linha('42650013', '3', '1.000')]
    ]));
    expect(t.divergencias).toEqual(['dotacao_inicial']);
  });

  it('recusa o painel sem uma das colunas obrigatórias', () => {
    expect(() => montarTabela(cab.filter((c) => c !== 'Empenhado'), new Map())).toThrow(/faltam as colunas empenhado/);
  });
});

describe('leitura do painel pela sessão do QlikView', () => {
  it('abre na aba, limpa os filtros, liga os seis agrupadores desligados, pede páginas grandes e lê tudo', async () => {
    const painel = painelFalso();
    const l = await lerEmendasDoPainel({ fetcher: painel.fetcher, xrfkey: 'ChaveDeTeste1234' });
    const { chamadas } = painel;

    expect(chamadas[0].url).toMatch(/^\/api-siop\/QvAjaxZfc\/QvsViewClient\.aspx\?mark=&host=QVS%40pqlk04&view=IAS%2FExecucao_Orcamentaria\.qvw/);
    expect(chamadas[0].url).toContain('xrfkey=ChaveDeTeste1234');
    expect(chamadas[0].cookie).toBe('xrfkey=ChaveDeTeste1234');
    expect(chamadas[0].corpo).toContain('<set name="Document.TabRow.Document\\SH08" action="" />');
    expect(chamadas[1].url).toContain('mark=40E69F2CB69D036A');
    expect(chamadas[2].corpo).toContain('<set name="Document.StandardActions.CLEARSTATE" action=""');
    expect(painel.foiLimpo()).toBe(true);

    // Todos os doze ligados no fim; os seis que já estavam ligados foram clicados duas vezes (desligou e voltou).
    expect(painel.ligados.size).toBe(12);
    expect(l.agrupadoresLigados).toEqual(['Por Partido', 'Por UF do Autor', 'Por Unidade Orçamentária', 'Por Localizador', 'Por GND', 'Por Natureza de Despesa']);
    expect(l.agrupadoresNaoEncontrados).toEqual([]);
    const cliques = chamadas.map((c) => c.corpo.match(/<set name="Document\.(\d+)\.Content"/)?.[1]).filter(Boolean);
    expect(cliques.filter((n) => n === '87')).toHaveLength(2);
    expect(cliques.filter((n) => n === '100')).toHaveLength(1);

    expect(chamadas.some((c) => c.corpo.includes('<set name="79" pageSize="19:2000" />'))).toBe(true);
    // O servidor falso ignora o pageSize e devolve 40 por vez: a leitura segue pelo que veio.
    expect(chamadas.filter((c) => c.corpo.includes('<get name="79"')).map((c) => c.corpo.match(/offset="0:(\d+)"/)![1])).toEqual(['0', '40', '80']);
    expect(l.linhasNoPainel).toBe(120);
    expect(l.linhas).toHaveLength(119);
    expect(l.baseSiafi).toBe('2026-10-30');
    expect(l.linhas[0]).toMatchObject({
      ano: 2026, emenda: '38980002', autor: 'Adolfo Viana', tipo_autor: 'Deputado Federal', rp: '6 - Emendas Individuais',
      orgao: '30000 - Ministério da Justiça e Segurança Pública', modalidade: '30 - Transferências a Estados e ao Distrito Federal',
      dotacao_inicial: 1000000, dotacao_atual: 950000, empenhado: 950000, liquidado: 0, pago: 0
    });
    // O Total real é das 561 emendas; com só 119 linhas a conferência acusa todas as colunas.
    expect(l.divergencias).toEqual(['dotacao_inicial', 'dotacao_atual', 'empenhado', 'liquidado', 'pago']);
  });

  it('liga também a Modalidade quando a sessão abre com ela desligada (como no print de 03/11)', async () => {
    const painel = painelFalso({ ligados: ['Por Autor da Emenda', 'Por Tipo de Autor', 'Por Número de Emenda', 'Por Órgão Orçamentário', 'Por Ação'] });
    const l = await lerEmendasDoPainel({ fetcher: painel.fetcher });
    expect(painel.ligados.size).toBe(12);
    expect(l.agrupadoresLigados).toContain('Por Modalidade');
    expect(l.agrupadoresLigados).toHaveLength(7);
  });

  it('pode manter os filtros e os agrupadores do painel', async () => {
    const painel = painelFalso();
    await lerEmendasDoPainel({ fetcher: painel.fetcher, limparFiltros: false, agrupadores: [] });
    expect(painel.foiLimpo()).toBe(false);
    expect(painel.chamadas.some((c) => /Document\.\d+\.Content/.test(c.corpo))).toBe(false);
  });

  it('se a sessão abrir no menu inicial, clica em "Emendas Parlamentares" (TX1738) e segue', async () => {
    const painel = painelFalso({ menuPrimeiro: true });
    const l = await lerEmendasDoPainel({ fetcher: painel.fetcher, limparFiltros: false, agrupadores: [] });
    expect(painel.chamadas[2].corpo).toContain('<set name="Document.20.Content" action=""');
    expect(l.linhas).toHaveLength(119);
  });

  it('não devolve leitura pela metade quando o tempo acaba', async () => {
    const { fetcher } = painelFalso();
    let t = 0;
    await expect(lerEmendasDoPainel({ fetcher, orcamentoMs: 50, agora: () => (t += 20) })).rejects.toThrow(/tempo acabou.*nada foi gravado/);
  });

  it('explica quando a Cloudflare barra o servidor', async () => {
    const { fetcher } = painelFalso({ status: 403, corpo: '<html>Just a moment...</html>' });
    await expect(lerEmendasDoPainel({ fetcher })).rejects.toThrow(/recusou o acesso do servidor \(HTTP 403/);
  });

  it('o teste de acesso (dry) faz a preparação inteira e lê só a primeira página', async () => {
    const painel = painelFalso();
    const r = await testarEmendasDoPainelSiop({ fetcher: painel.fetcher });
    expect(painel.chamadas.filter((c) => c.corpo.includes('<get name="79"'))).toHaveLength(1);
    expect(r).toMatchObject({ linhasNoPainel: 120, linhasLidas: 39, baseSiafi: '2026-10-30', anos: [2026], orgaos: 1 });
    expect(r.agrupadoresLigados).toHaveLength(6);
  });
});

describe('gravação da leitura', () => {
  it('grava em lotes com o mesmo id e conclui pelos anos lidos', async () => {
    const lotes: Array<{ id: string; n: number }> = [];
    let concluiu: { id: string; anos: number[] } | null = null;
    const linhas = Array.from({ length: LOTE_DE_GRAVACAO * 2 + 10 }, (_, i) => ({ ano: i % 2 ? 2026 : 2025, emenda: '42650013', chave: `k${i}` }));
    const leitura = { ...resumoBase(), linhas } as never;
    const r = await gravarLeitura(leitura, {
      gravar: async (id, l) => (lotes.push({ id, n: l.length }), l.length),
      concluir: async (id, anos) => ((concluiu = { id, anos }), 7)
    }, 'leitura-1');
    expect(lotes).toEqual([{ id: 'leitura-1', n: LOTE_DE_GRAVACAO }, { id: 'leitura-1', n: LOTE_DE_GRAVACAO }, { id: 'leitura-1', n: 10 }]);
    expect(concluiu).toEqual({ id: 'leitura-1', anos: [2025, 2026] });
    expect(r).toEqual({ gravadas: linhas.length, removidas: 7 });
  });

  it('resumo sem linhas', () => {
    expect(resumoDaLeitura({ ...resumoBase(), linhas: [] })).toMatchObject({ emendas: 0, anos: [], amostra: null });
  });
});

function resumoBase() {
  return {
    linhas: [], cabecalhos: [], totais: { dotacao_inicial: null, dotacao_atual: null, empenhado: null, liquidado: null, pago: null },
    divergencias: [], baseSiafi: null, linhasNoPainel: 0, agrupadoresLigados: [], agrupadoresNaoEncontrados: [], chamadas: 0
  };
}
