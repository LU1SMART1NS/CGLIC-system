import { describe, expect, it } from 'vitest';
import {
  baseSiafiDaResposta,
  grupoComDados,
  infoDaTabela,
  lerEmendasDoPainel,
  lerPagina,
  lerXml,
  montarTabela,
  valorDoPainel
} from '../siopPainelQlik';
import { resumoDaLeitura, testarEmendasDoPainelSiop } from '../emendasPainelSiopSyncService';

// Respostas reais do painel (HAR de 03/11/2026), sem os estilos e com só os atributos lidos.
const ARQUIVOS = import.meta.glob('./fixtures/siop/*.xml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const ABRIR = ARQUIVOS['./fixtures/siop/abrir-sessao.xml'];
const POLL_EMENDAS = ARQUIVOS['./fixtures/siop/poll-aba-emendas.xml'];
const POLL_MENU = ARQUIVOS['./fixtures/siop/poll-menu-inicial.xml'];
const PAGINA_40 = ARQUIVOS['./fixtures/siop/pagina-40.xml'];
const PAGINA_80 = ARQUIVOS['./fixtures/siop/pagina-80.xml'];

/** Painel falso: responde a cada comando com a fixture certa e guarda o que recebeu. */
function painelFalso(respostas: { poll: string[]; paginas: Record<number, string>; status?: number; corpo?: string }) {
  const chamadas: Array<{ url: string; corpo: string; cookie: string }> = [];
  let polls = 0;
  const fetcher = (async (url: string, init?: RequestInit) => {
    const corpo = String(init?.body ?? '');
    chamadas.push({ url, corpo, cookie: String((init?.headers as Record<string, string>)?.cookie ?? '') });
    if (respostas.status) return new Response(respostas.corpo ?? '', { status: respostas.status });
    let texto = ABRIR;
    if (corpo.includes('<poll ')) texto = respostas.poll[Math.min(polls++, respostas.poll.length - 1)];
    else if (corpo.includes('.Content"')) texto = ABRIR;
    else {
      const m = corpo.match(/<get name="79" offset="0:(\d+)"/);
      if (m) texto = respostas.paginas[Number(m[1])];
    }
    return new Response(texto, { status: 200 });
  }) as unknown as typeof fetch;
  return { fetcher, chamadas };
}

const com120Linhas = (xml: string) => xml.replace('totalsize="13:562"', 'totalsize="13:120"');

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

  it('lê uma página: cabeçalhos, linha 0 = Total e as células mescladas repetidas em cada linha', () => {
    const p = lerPagina(grupoComDados(lerXml(POLL_EMENDAS), '79')!);
    expect(p.cabecalhos).toEqual([
      'Ano', 'RP', 'Autor', 'Tipo Autor', 'Nro. Emenda', 'Órgão', 'Ação', 'Modalidade',
      'Dotação Inicial Emenda', 'Dotação Atual Emenda', 'Empenhado', 'Liquidado', 'Pago'
    ]);
    expect([...p.linhas.keys()]).toEqual(Array.from({ length: 40 }, (_, i) => i));
    expect(p.linhas.get(0)!.slice(0, 2)).toEqual(['Total', '']);
    expect(p.linhas.get(1)!.slice(2, 5)).toEqual(['Adolfo Viana', 'Deputado Federal', '38980002']);
    expect(p.linhas.get(2)![2]).toBe('Adolfo Viana');
    const p40 = lerPagina(grupoComDados(lerXml(PAGINA_40), '79')!);
    expect(Math.min(...p40.linhas.keys())).toBe(40);
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
  const cab = ['Ano', 'RP', 'Autor', 'Tipo Autor', 'Nro. Emenda', 'Órgão', 'Ação', 'Modalidade', 'Dotação Inicial Emenda', 'Dotação Atual Emenda', 'Empenhado', 'Liquidado', 'Pago'];
  const linha = (emenda: string, acao: string, mod: string, v: string) => ['2026', '6 - Emendas Individuais', 'Fulano', 'Senador', emenda, '30000 - MJSP', acao, mod, v, v, v, '0', '0'];

  it('confere com o Total do painel e junta a mesma emenda, ação e modalidade', () => {
    const t = montarTabela(cab, new Map([
      [0, ['Total', '', '', '', '', '', '', '', '3.500', '3.500', '3.500', '0', '0']],
      [1, linha('42650013', '2723 - Policiamento', '90 - Aplicações Diretas', '1.000')],
      [2, linha('42650013', '2723 - Policiamento', '90 - Aplicações Diretas', '500')],
      [3, linha('42650013', '21BM - Políticas', '90 - Aplicações Diretas', '2.000')]
    ]));
    expect(t.divergencias).toEqual([]);
    expect(t.totais.empenhado).toBe(3500);
    expect(t.linhas).toHaveLength(2);
    expect(t.linhas[0]).toMatchObject({ ano: 2026, emenda: '42650013', acao: '2723 - Policiamento', dotacao_atual: 1500, liquidado: 0 });
  });

  it('aponta quando a soma não bate com o Total', () => {
    const t = montarTabela(cab, new Map([
      [0, ['Total', '', '', '', '', '', '', '', '9.999', '1.000', '1.000', '0', '0']],
      [1, linha('42650013', '2723', '90', '1.000')]
    ]));
    expect(t.divergencias).toEqual(['dotacao_inicial']);
  });

  it('recusa o painel sem uma das colunas esperadas', () => {
    expect(() => montarTabela(cab.filter((c) => c !== 'Empenhado'), new Map())).toThrow(/faltam as colunas Empenhado/);
  });
});

describe('leitura do painel pela sessão do QlikView', () => {
  it('abre na aba das emendas, pagina até o fim e manda a chave anti-CSRF no endereço e no cookie', async () => {
    const { fetcher, chamadas } = painelFalso({ poll: [com120Linhas(POLL_EMENDAS)], paginas: { 40: com120Linhas(PAGINA_40), 80: com120Linhas(PAGINA_80) } });
    const l = await lerEmendasDoPainel({ fetcher, xrfkey: 'ChaveDeTeste1234' });

    expect(chamadas).toHaveLength(4); // abrir, poll (traz a 1ª página), páginas 40 e 80
    expect(chamadas[0].url).toMatch(/^\/api-siop\/QvAjaxZfc\/QvsViewClient\.aspx\?mark=&host=QVS%40pqlk04&view=IAS%2FExecucao_Orcamentaria\.qvw/);
    expect(chamadas[0].url).toContain('xrfkey=ChaveDeTeste1234');
    expect(chamadas[0].cookie).toBe('xrfkey=ChaveDeTeste1234');
    expect(chamadas[0].corpo).toContain('<set name="Document.TabRow.Document\\SH08" action="" />');
    expect(chamadas[0].corpo).toContain('sharedfile="true"');
    // Depois de aberta, a sessão segue com o mark e o stamp devolvidos pelo servidor.
    expect(chamadas[1].url).toContain('mark=40E69F2CB69D036A');
    expect(chamadas[2].corpo).toContain('<get name="79" offset="0:40" />');
    // O stamp é sempre o da última resposta (a do poll), como o navegador faz.
    expect(chamadas[2].corpo).toContain('stamp="40E69F2E9DAD524D"');

    expect(l.linhasNoPainel).toBe(120);
    expect(l.linhas).toHaveLength(119);
    expect(l.baseSiafi).toBe('2026-10-30');
    expect(l.linhas[0]).toMatchObject({
      ano: 2026, emenda: '38980002', autor: 'Adolfo Viana', tipo_autor: 'Deputado Federal', rp: '6 - Emendas Individuais',
      orgao: '30000 - Ministério da Justiça e Segurança Pública', modalidade: '30 - Transferências a Estados e ao Distrito Federal',
      dotacao_inicial: 1000000, dotacao_atual: 950000, empenhado: 950000, liquidado: 0, pago: 0
    });
    // O Total real é das 561 emendas; com só 119 linhas a conferência acusa todas as colunas.
    expect(l.totais).toEqual({ dotacao_inicial: 892102597, dotacao_atual: 808101007, empenhado: 421319837, liquidado: 34983928, pago: 23827038 });
    expect(l.divergencias).toEqual(['dotacao_inicial', 'dotacao_atual', 'empenhado', 'liquidado', 'pago']);
  });

  it('se a sessão abrir no menu inicial, clica em "Emendas Parlamentares" (TX1738) e lê de novo', async () => {
    const { fetcher, chamadas } = painelFalso({ poll: [POLL_MENU, com120Linhas(POLL_EMENDAS)], paginas: { 40: com120Linhas(PAGINA_40), 80: com120Linhas(PAGINA_80) } });
    const l = await lerEmendasDoPainel({ fetcher });
    expect(chamadas[2].corpo).toContain('<set name="Document.20.Content" action=""');
    expect(l.linhas).toHaveLength(119);
  });

  it('não devolve leitura pela metade quando o tempo acaba', async () => {
    const { fetcher } = painelFalso({ poll: [POLL_EMENDAS], paginas: { 40: PAGINA_40, 80: PAGINA_80 } });
    let t = 0;
    await expect(lerEmendasDoPainel({ fetcher, orcamentoMs: 10, agora: () => (t += 20) })).rejects.toThrow(/tempo acabou.*nada foi gravado/);
  });

  it('explica quando a Cloudflare barra o servidor', async () => {
    const { fetcher } = painelFalso({ poll: [], paginas: {}, status: 403, corpo: '<html>Just a moment...</html>' });
    await expect(lerEmendasDoPainel({ fetcher })).rejects.toThrow(/recusou o acesso do servidor \(HTTP 403/);
  });

  it('o teste de acesso (dry) lê só duas páginas e resume', async () => {
    const { fetcher, chamadas } = painelFalso({ poll: [POLL_EMENDAS], paginas: { 40: PAGINA_40, 80: PAGINA_80 } });
    const r = await testarEmendasDoPainelSiop({ fetcher });
    expect(chamadas).toHaveLength(3);
    expect(r).toMatchObject({ linhasNoPainel: 562, linhasLidas: 79, baseSiafi: '2026-10-30', chamadas: 3 });
    expect(resumoDaLeitura({ linhas: [], totais: r.totais as never, divergencias: [], baseSiafi: null, linhasNoPainel: 0, chamadas: 0 })).toMatchObject({ emendas: 0, amostra: null });
  });
});
