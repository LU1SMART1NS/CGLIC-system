import { describe, expect, it, vi } from 'vitest';
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
import { resumoDaLeitura, sincronizarEmendasDoPainelSiop, testarEmendasDoPainelSiop } from '../emendasPainelSiopSyncService';

// Sem banco no teste: a reserva da sincronização só executa a tarefa.
vi.mock('../sincronizacaoFontesService', async (orig) => ({
  ...(await orig<typeof import('../sincronizacaoFontesService')>()),
  executarComReserva: async (_r: string, _u: string, _o: unknown, tarefa: () => Promise<unknown>) => tarefa()
}));

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

const TABELA = POLL_EMENDAS.slice(POLL_EMENDAS.indexOf('<group name="79"'), POLL_EMENDAS.indexOf('</group>', POLL_EMENDAS.indexOf('<group name="79"')) + 8);
const BASE = '<group name="113" objectid="Document\\TX1846" type="TX" mode="enabled"><value name="Content" text="Dados referentes à Base SIAFI de 30/10/2026"/></group>';
/** Os dois passos da aba, como no painel (TX1538 = Passo 1, TX1537 = Passo 2). */
const PASSOS = '<group name="26" objectid="Document\\TX1538" type="TX" mode="enabled"/><group name="13" objectid="Document\\TX1537" type="TX" mode="enabled"/>';
/** Lista de órgãos do Passo 1 (LB160), como veio do painel em 03/11/2026. */
const ORGAOS = '<group name="32" objectid="Document\\LB160" type="LB" label="Orgão Orçamentário"><value name="C0">' +
  '<element value="32" text="03000 - Tribunal de Contas da União"/><element value="9" text="30000 - Ministério da Justiça e Segurança Pública"/>' +
  '<element value="34" text="36000 - Ministério da Saúde"/></value></group>';
/** Colunas que o agrupador põe na tabela e que as fixtures (do HAR) ainda não têm. */
const COLUNA_NOVA: Record<string, string> = { 'Por UF do Autor': 'UF Autor', 'Por GND': 'GND' };

/**
 * Painel falso: guarda os comandos e responde como o painel. A aba abre nos gráficos (tabela escondida); "Passo 1"
 * mostra a lista de órgãos; "Passo 2" mostra a tabela (120 linhas). Cada agrupador ligado que as fixtures não têm
 * (UF do autor, GND) vira uma coluna a mais.
 */
function painelFalso(opts: { menuPrimeiro?: boolean; status?: number; corpo?: string; semMjsp?: boolean } = {}) {
  const chamadas: Array<{ url: string; corpo: string; cookie: string }> = [];
  const ligados = new Set<string>();
  let menu = Boolean(opts.menuPrimeiro);
  let passo: 'graficos' | 'filtros' | 'tabela' = 'graficos';
  let orgao: string | null = null;
  const botaoDe = Object.fromEntries(Object.entries(BOTAO).map(([r, b]) => [b, r]));
  const extras = () => [...ligados].filter((r) => COLUNA_NOVA[r]).map((r, i) => `<value name="C${20 + i}"><element text="${COLUNA_NOVA[r]}"/></value>`).join('');
  const comExtras = (xml: string) => xml.replace(/(<group name="79"[^>]*>)/, `$1${extras()}`).replace('totalsize="13:562"', `totalsize="${13 + ligados.size}:120"`);
  const fetcher = (async (url: string, init?: RequestInit) => {
    const corpo = String(init?.body ?? '');
    chamadas.push({ url, corpo, cookie: String((init?.headers as Record<string, string>)?.cookie ?? '') });
    if (opts.status) return new Response(opts.corpo ?? '', { status: opts.status });
    let texto = ABRIR;
    const clique = corpo.match(/<set name="Document\.(\d+)\.Content"/);
    const selecao = corpo.match(/<set name="32" select="(\d+)"/);
    if (clique) {
      if (clique[1] === '20') menu = false;
      else if (clique[1] === '26') passo = 'filtros';
      else if (clique[1] === '13') passo = 'tabela';
      else if (botaoDe[clique[1]]) ligados.has(botaoDe[clique[1]]) ? ligados.delete(botaoDe[clique[1]]) : ligados.add(botaoDe[clique[1]]);
    } else if (selecao) orgao = selecao[1];
    else if (corpo.includes('<poll ')) {
      texto = menu
        ? POLL_MENU
        : '<?xml version="1.0" encoding="UTF-8" ?><result mark="40E69F2CB69D036A" stamp="1"><object name="Document">' +
          PASSOS + AGRUPADORES_XML + BASE + (passo === 'filtros' ? ORGAOS : '') +
          (passo === 'tabela' ? comExtras(TABELA) : '<group name="79" objectid="Document\\CH102" type="CH" mode="hidden"/>') +
          '</object></result>';
    } else {
      const m = corpo.match(/<get name="79" offset="0:(\d+)"/);
      if (m) texto = comExtras(({ 0: POLL_EMENDAS, 40: PAGINA_40, 80: PAGINA_80 } as Record<string, string>)[m[1]]);
      if (m && opts.semMjsp) texto = texto.replaceAll('30000 - Ministério da Justiça e Segurança Pública', '36000 - Ministério da Saúde');
    }
    return new Response(texto, { status: 200 });
  }) as unknown as typeof fetch;
  return { fetcher, chamadas, ligados, orgao: () => orgao };
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
  it('abre na aba, filtra o MJSP no Passo 1, mostra a tabela no Passo 2, liga UF e GND, pede páginas grandes e lê tudo', async () => {
    const painel = painelFalso();
    const l = await lerEmendasDoPainel({ fetcher: painel.fetcher, xrfkey: 'ChaveDeTeste1234' });
    const { chamadas } = painel;

    expect(chamadas[0].url).toMatch(/^\/api-siop\/QvAjaxZfc\/QvsViewClient\.aspx\?mark=&host=QVS%40pqlk04&view=IAS%2FExecucao_Orcamentaria\.qvw/);
    expect(chamadas[0].url).toContain('xrfkey=ChaveDeTeste1234');
    expect(chamadas[0].cookie).toBe('xrfkey=ChaveDeTeste1234');
    expect(chamadas[0].corpo).toContain('<set name="Document.TabRow.Document\\SH08" action="" />');
    expect(chamadas[1].url).toContain('mark=40E69F2CB69D036A');
    const comandos = chamadas.map((c) => c.corpo.replace(/<poll [^>]*>/g, '').replace(/^<update[^>]*>|<\/update>$/g, '')).filter(Boolean);
    expect(comandos.slice(1, 4)).toEqual([
      '<set name="Document.26.Content" action="" clientsizeWH="1600:1000" />',
      '<set name="32" select="9" toggle="false" />',
      '<set name="Document.13.Content" action="" clientsizeWH="1600:1000" />'
    ]);
    expect(painel.orgao()).toBe('9');

    // A tabela das fixtures já tem autor, tipo, nº, órgão, ação e modalidade: só UF e GND são ligados.
    expect(l.agrupadoresLigados).toEqual(['Por UF do Autor', 'Por GND']);
    expect([...painel.ligados]).toEqual(['Por UF do Autor', 'Por GND']);

    expect(chamadas.some((c) => c.corpo.includes('<set name="79" pageSize="15:2000" />'))).toBe(true);
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

  it('se a sessão abrir no menu inicial, clica em "Emendas Parlamentares" (TX1738) e segue', async () => {
    const painel = painelFalso({ menuPrimeiro: true });
    const l = await lerEmendasDoPainel({ fetcher: painel.fetcher });
    expect(painel.chamadas[2].corpo).toContain('<set name="Document.20.Content" action=""');
    expect(l.linhas).toHaveLength(119);
  });

  it('recusa a leitura quando o filtro do órgão não pegou', async () => {
    await expect(lerEmendasDoPainel({ fetcher: painelFalso({ semMjsp: true }).fetcher })).rejects.toThrow(/filtro do órgão não pegou/);
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
    expect(r).toMatchObject({ linhasNoPainel: 120, linhasLidas: 39, linhasParaGravar: 39, baseSiafi: '2026-10-30', anos: [2026] });
    expect(r.agrupadoresLigados).toEqual(['Por UF do Autor', 'Por GND']);
  });
});

describe('gravação da leitura', () => {
  const gravacao = { gravadas: 2, removidas: 0, codigos: 1, registradas: 1, atualizadas: 0, semParlamentar: [] };
  const linhaDe = (ano: number, emenda: string) => ({ ano, emenda, chave: emenda, dimensoes: { Ano: String(ano) } }) as never;

  it('grava numa chamada só as linhas a partir de 2026, sem as colunas como vieram, e conta as emendas novas', async () => {
    const chamadas: Array<{ n: number; base: string | null; anos: number[]; comDimensoes: boolean }> = [];
    const leitura = { ...resumoBase(), baseSiafi: '2026-10-30', linhas: [linhaDe(2025, '30880005'), linhaDe(2026, '71020007'), linhaDe(2026, '38980002')] };
    const r = await sincronizarEmendasDoPainelSiop({
      forcar: true,
      ler: async () => leitura,
      gravador: async (linhas, base, anos) => (chamadas.push({ n: linhas.length, base, anos, comDimensoes: linhas.some((l) => 'dimensoes' in l) }), gravacao)
    });
    expect(chamadas).toEqual([{ n: 2, base: '2026-10-30', anos: [2026], comDimensoes: false }]);
    expect(r).toMatchObject({ status: 'SUCESSO', total: 2 });
    expect((r as { mensagem: string }).mensagem).toContain('1 emenda(s) nova(s) registrada(s)');
  });

  it('não grava quando a soma não bate com o Total', async () => {
    let gravou = false;
    const r = await sincronizarEmendasDoPainelSiop({
      forcar: true,
      ler: async () => ({ ...resumoBase(), divergencias: ['empenhado'], linhas: [linhaDe(2026, '71020007')] }),
      gravador: async () => ((gravou = true), gravacao)
    });
    expect(gravou).toBe(false);
    expect(r).toMatchObject({ status: 'ERRO' });
  });

  it('resumo sem linhas', () => {
    expect(resumoDaLeitura({ ...resumoBase(), linhas: [] })).toMatchObject({ emendas: 0, anos: [], amostra: null, linhasParaGravar: 0 });
  });
});

function resumoBase() {
  return {
    linhas: [], cabecalhos: [], totais: { dotacao_inicial: null, dotacao_atual: null, empenhado: null, liquidado: null, pago: null },
    divergencias: [] as string[], baseSiafi: null as string | null, linhasNoPainel: 0, agrupadoresLigados: [], chamadas: 0
  };
}
