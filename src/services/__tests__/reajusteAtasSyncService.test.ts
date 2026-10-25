import { describe, it, expect, vi, beforeEach } from 'vitest';

// Banco simulado: só as chamadas que o serviço usa.
const banco = vi.hoisted(() => ({
  fila: [] as unknown[],
  gravacoes: [] as Array<Record<string, unknown>>,
  itens: [] as Array<{ numero_item: string; fornecedor_cnpj_cpf: string | null }>,
  homologados: [] as Array<{ numero_item: string }>,
  indices: [] as Array<{ lido_em: string }>
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(async (nome: string, args: Record<string, unknown>) => {
      if (nome === 'atas_para_reajuste') return { data: banco.fila, error: null };
      if (nome === 'gravar_reajuste_fontes') {
        banco.gravacoes.push(args.p_payload as Record<string, unknown>);
        return { data: { success: true }, error: null };
      }
      return { data: null, error: { message: `rpc inesperada ${nome}` } };
    }),
    from: vi.fn((tabela: string) => ({
      select: () => {
        const dados = () => Promise.resolve({ data: tabela === 'itens_ata' ? banco.itens : tabela === 'indices_precos_mensais' ? banco.indices : banco.homologados, error: null });
        const consulta: Record<string, unknown> = {
          eq: () => consulta,
          order: () => consulta,
          limit: () => dados(),
          then: (ok: (v: unknown) => unknown, falha: (e: unknown) => unknown) => dados().then(ok, falha)
        };
        return consulta;
      }
    }))
  }
}));

vi.mock('../sincronizacaoFontesService', async (original) => ({
  ...(await original<typeof import('../sincronizacaoFontesService')>()),
  executarComReserva: vi.fn(async (_r: string, _u: string, _o: unknown, tarefa: () => Promise<unknown>) => tarefa())
}));

import {
  escolherHomologado,
  janelasDeUmAno,
  lerIndicesIpca,
  lerResultadosDaUasg,
  partesDoControle,
  sincronizarReajusteAtas,
  textosDoArquivo,
  type LeitorDeArquivos
} from '../reajusteAtasSyncService';

const json = (dados: unknown, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json' } });
const PDF = (texto: string) => new TextEncoder().encode(`%PDF-1.4 ${texto}`);
const ZIP = (id: string) => new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode(id)]);
const sem = async () => {};

/** Leitor falso: o "PDF" é texto depois do cabeçalho; os zips são um mapa por conteúdo. */
function leitorFalso(zips: Record<string, Array<{ nome: string; bytes: Uint8Array }>>): LeitorDeArquivos {
  return {
    textoDoPdf: async (b) => new TextDecoder().decode(b).slice(9),
    arquivosDoZip: async (b) => zips[new TextDecoder().decode(b.slice(4))] ?? []
  };
}

const SGS = [{ data: '01/08/2026', valor: '-0.32' }, { data: '01/09/2026', valor: '0.82' }];
const FOCUS = {
  value: [
    { Data: '2026-10-16', DataReferencia: '10/2026', Mediana: 0.3 },
    { Data: '2026-10-16', DataReferencia: '09/2026', Mediana: 0.5 },
    { Data: '2026-10-09', DataReferencia: '10/2026', Mediana: 0.9 }
  ]
};

describe('lerIndicesIpca', () => {
  it('oficial do SGS e projetado só do Focus mais recente, depois do último mês oficial', async () => {
    const fetcher = vi.fn(async (url: string) => (url.includes('sgs.433') ? json(SGS) : json(FOCUS)));
    const r = await lerIndicesIpca(fetcher as unknown as typeof fetch, sem, new Date('2026-10-23T12:00:00Z'));
    expect(r).toEqual([
      { indice: 'IPCA', mes: '2026-08-01', tipo: 'OFICIAL', variacao: -0.32, fonte: 'BCB_SGS_433' },
      { indice: 'IPCA', mes: '2026-09-01', tipo: 'OFICIAL', variacao: 0.82, fonte: 'BCB_SGS_433' },
      { indice: 'IPCA', mes: '2026-10-01', tipo: 'PROJETADO', variacao: 0.3, fonte: 'BCB_FOCUS', referencia: '2026-10-16' }
    ]);
    expect(String(fetcher.mock.calls[0][0])).toContain('/api-bcb/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=01/10/2022');
    expect(String(fetcher.mock.calls[1][0])).toContain('/api-bcb-olinda/');
  });
});

describe('textosDoArquivo', () => {
  it('PDF solto, zip e zip dentro de zip; no edital, só as partes com a cláusula (sem a relação de itens)', async () => {
    const leitor = leitorFalso({
      externo: [
        { nome: 'RelacaoItens.pdf', bytes: PDF('itens') },
        { nome: 'Edital PE 90039.zip', bytes: ZIP('interno') }
      ],
      interno: [
        { nome: 'Anexo I - Termo de Refer?ncia n? 71_2025.pdf', bytes: PDF('cláusula TR') },
        { nome: 'Anexo do Termo de Refer?ncia I - Especifica??es T?cnicas.pdf', bytes: PDF('especificação') },
        { nome: 'Annex I - Terms of Reference.pdf', bytes: PDF('english') }
      ]
    });
    expect(await textosDoArquivo(PDF('solto'), leitor)).toEqual(['solto']);
    expect(await textosDoArquivo(ZIP('externo'), leitor, { soPartesDoEdital: true })).toEqual(['cláusula TR']);
  });
});

describe('limites da leitura do edital', () => {
  it('para no primeiro PDF que tem a cláusula com a data e lê no máximo 4 PDFs', async () => {
    const lidos: string[] = [];
    const leitor: LeitorDeArquivos = {
      textoDoPdf: async (b, o) => {
        const t = new TextDecoder().decode(b).slice(9);
        lidos.push(`${t}|${o?.maxPaginas}`);
        return t;
      },
      arquivosDoZip: async (_b, aceitar) =>
        [
          { nome: 'Edital.pdf', bytes: PDF('edital sem cláusula') },
          { nome: 'Anexo II - Minuta de Contrato.pdf', bytes: PDF('fixos e irreajustáveis IPCA data do orçamento estimado, em 30/09/2024') },
          { nome: 'Anexo I - Termo de Referência.pdf', bytes: PDF('TR') },
          { nome: 'Planilha.pdf', bytes: PDF('planilha') }
        ].filter((p) => !aceitar || aceitar(p.nome, p.bytes.length))
    };
    const achou = (t: string) => /irreajust/.test(t) && /30\/09\/2024/.test(t);
    const textos = await textosDoArquivo(ZIP('x'), leitor, { soPartesDoEdital: true, parar: achou });
    expect(lidos).toEqual(['fixos e irreajustáveis IPCA data do orçamento estimado, em 30/09/2024|400']);
    expect(textos).toHaveLength(1);
    const todos: string[] = [];
    const muitos: LeitorDeArquivos = {
      textoDoPdf: async (b) => { todos.push('x'); return new TextDecoder().decode(b); },
      arquivosDoZip: async () => Array.from({ length: 7 }, (_, k) => ({ nome: `Edital parte ${k}.pdf`, bytes: PDF(String(k)) }))
    };
    await textosDoArquivo(ZIP('y'), muitos, { soPartesDoEdital: true });
    expect(todos).toHaveLength(4);
  });
});

describe('resultado dos itens em lote', () => {
  it('janelas de até 365 dias até hoje', () => {
    expect(janelasDeUmAno(2024, new Date('2026-10-24T12:00:00Z'))).toEqual([
      ['2024-01-01', '2024-12-30'],
      ['2024-12-31', '2025-12-30'],
      ['2025-12-31', '2026-10-24']
    ]);
  });

  it('lê todas as páginas, ignora resultado cancelado e trata resposta vazia como bloqueio', async () => {
    const pagina = (n: number, linhas: unknown[]) => json({ totalPaginas: 2, resultado: linhas.map((l) => ({ ...(l as object), pagina: n })) });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(''))
      .mockResolvedValueOnce(pagina(1, [{ idContratacaoPNCP: 'C', numeroItemPncp: 1, niFornecedor: '11.222.333/0001-44', valorUnitarioHomologado: 10, ordemClassificacaoSrp: 1 }]))
      .mockResolvedValueOnce(pagina(2, [{ idContratacaoPNCP: 'C', numeroItemPncp: 2, niFornecedor: '1', valorUnitarioHomologado: 5, situacaoCompraItemResultadoNome: 'Cancelado' }]));
    const mapa = await lerResultadosDaUasg('200331', 2026, { fetcher: fetcher as unknown as typeof fetch, esperar: sem, hoje: new Date('2026-10-24T12:00:00Z') });
    expect([...mapa.entries()]).toEqual([['C|1', [{ niFornecedor: '11222333000144', valor: 10, ordem: 1 }]]]);
    expect(String(fetcher.mock.calls[1][0])).toContain('unidadeOrgaoCodigoUnidade=200331&dataResultadoPncpInicial=2026-01-01&dataResultadoPncpFinal=2026-10-24');
  });

  it('escolhe o preço do fornecedor da ata; sem ele, só quando há um resultado', () => {
    const dois = [{ niFornecedor: '1', valor: 10, ordem: 1 }, { niFornecedor: '2', valor: 12, ordem: 2 }];
    expect(escolherHomologado(dois, '00.000.000/0000-02'.replace(/\D/g, '').replace(/^0+/, ''))).toBe(12);
    expect(escolherHomologado(dois, '9')).toBeNull();
    expect(escolherHomologado([{ niFornecedor: '1', valor: 10, ordem: 1 }], null)).toBe(10);
    expect(escolherHomologado(undefined, '1')).toBeNull();
  });
});

describe('partesDoControle', () => {
  it('controle do PNCP da ata', () => {
    expect(partesDoControle('00394494000136-1-001132/2024-000003')).toEqual({ cnpj: '00394494000136', ano: '2024', sequencial: 1132, sequencialAta: 3 });
    expect(partesDoControle('qualquer')).toBeNull();
  });
});

describe('sincronizarReajusteAtas', () => {
  beforeEach(() => {
    banco.gravacoes = [];
    banco.itens = [{ numero_item: '00001', fornecedor_cnpj_cpf: '11.222.333/0001-44' }, { numero_item: '00002', fornecedor_cnpj_cpf: '11222333000144' }];
    banco.homologados = [{ numero_item: '00002' }];
    banco.fila = [{
      ata_id: 'ata-1', numero_ata: '00093/2024', codigo_uasg: '200331', numero_controle_pncp: '00394494000136-1-001132/2024-000003',
      data_vigencia_inicial: '2025-01-09', data_vigencia_final: '2027-01-08', edital_lido_em: null,
      documentos_pncp_lidos: [], documentos_lidos_em: null, itens_sem_homologado: 1
    }];
  });

  function fontes(extra: (url: string) => Response | undefined = () => undefined) {
    return vi.fn(async (url: string) => {
      const r = extra(url);
      if (r) return r;
      if (url.includes('sgs.433')) return json(SGS);
      if (url.includes('olinda')) return json(FOCUS);
      if (url.endsWith('/compras/2024/1132/arquivos')) return json([{ sequencialDocumento: 1, tipoDocumentoNome: 'Edital', url: 'https://pncp.gov.br/edital' }]);
      if (url === 'https://pncp.gov.br/edital') return new Response(PDF('Os preços são fixos e irreajustáveis ... data do orçamento estimado, em 30/09/2024 ... índice IPCA.'));
      if (url.endsWith('/atas/3/arquivos')) {
        return json([
          { sequencialDocumento: 1, titulo: 'Ata', url: 'https://pncp.gov.br/ata1' },
          { sequencialDocumento: 3, titulo: 'Reajustar os valores unitários pelo IPCA de 5,17%', url: 'https://pncp.gov.br/ata3', dataPublicacaoPncp: '2026-04-28T10:00:00' }
        ]);
      }
      if (url === 'https://pncp.gov.br/ata3') {
        return new Response(PDF('reajustados pelo IPCA de 5,17% (34108953), considerando o período do orçamento estimado de 10/2024 a 09/2025 (29255776), para aplicação no novo ciclo de vigência da Ata 09/01/2026 a 08/01/2027.'));
      }
      if (url.includes('3_consultarResultadoItensContratacoes_PNCP_14133')) {
        return json({
          totalPaginas: 1,
          resultado: [
            { idContratacaoPNCP: '00394494000136-1-001132/2024', numeroItemPncp: 1, niFornecedor: '99999999000199', valorUnitarioHomologado: 99, ordemClassificacaoSrp: 2, situacaoCompraItemResultadoNome: 'Informado' },
            { idContratacaoPNCP: '00394494000136-1-001132/2024', numeroItemPncp: 1, niFornecedor: '11222333000144', valorUnitarioHomologado: 14695, ordemClassificacaoSrp: 1, situacaoCompraItemResultadoNome: 'Informado' }
          ]
        });
      }
      if (url.endsWith('/itens/1/resultados')) {
        return json([{ valorUnitarioHomologado: 99, niFornecedor: '99999999000199' }, { valorUnitarioHomologado: 14695, niFornecedor: '11222333000144' }]);
      }
      return new Response('', { status: 404 });
    });
  }

  it('lê índices, edital, apostilamento e preço homologado, e grava a ata', async () => {
    const fetcher = fontes();
    const r = await sincronizarReajusteAtas({ leitor: leitorFalso({}), fetcher: fetcher as unknown as typeof fetch, esperar: sem, hoje: () => new Date('2026-10-23T12:00:00Z') });
    expect(r).toEqual({ status: 'SUCESSO', total: 1, fontesComFalha: [] });
    expect(banco.gravacoes[0]).toMatchObject({ projetados_substituir: ['IPCA'] });
    // Primeiro o leve (arquivos da ata e preço homologado); depois a tentativa do edital; por fim o edital.
    expect(banco.gravacoes[2]).toEqual({ atas: [{ ata_id: 'ata-1', edital_tentativa: true }] });
    expect(banco.gravacoes[3]).toEqual({ atas: [{ ata_id: 'ata-1', clausula: 'COM_REAJUSTE', indice: 'IPCA', data_orcamento_edital: '2024-09-30' }] });
    expect(banco.gravacoes[1]).toEqual({
      atas: [{
        ata_id: 'ata-1',
        documentos_lidos: [1, 3],
        reajustes: [{
          documento_pncp_sequencial: 3,
          documento_titulo: 'Reajustar os valores unitários pelo IPCA de 5,17%',
          documento_publicado_em: '2026-04-28',
          efeito_inicio: '2026-01-09',
          percentual: 5.17,
          periodo_inicio: '2024-10-01',
          periodo_fim: '2025-09-01',
          indice: 'IPCA',
          sei_citado: '29255776',
          sei_citado_conformidade: false
        }],
        homologados: [{ numero_item: '00001', valor: 14695 }],
        homologados_completos: true
      }]
    });
    // Preço homologado pelo lote do Compras.gov.br: nenhuma consulta item por item no PNCP.
    expect(fetcher.mock.calls.some(([u]) => String(u).endsWith('/itens/1/resultados'))).toBe(false);
    expect(fetcher.mock.calls.some(([u]) => String(u).includes('unidadeOrgaoCodigoUnidade=200331'))).toBe(true);
    // A própria ata (arquivo 1) não é baixada.
    expect(fetcher.mock.calls.some(([u]) => u === 'https://pncp.gov.br/ata1')).toBe(false);
  });

  it('o termo aditivo e o apostilamento com o mesmo reajuste viram um só', async () => {
    const texto = 'reajustados pelo IPCA de 5,17% (34108953), considerando o período do orçamento estimado de 10/2024 a 09/2025 (29255776), para aplicação no novo ciclo de vigência da Ata 09/01/2026 a 08/01/2027.';
    const fetcher = fontes((url) => {
      if (url.endsWith('/atas/3/arquivos')) {
        return json([
          { sequencialDocumento: 2, titulo: 'PRIMEIRO TERMO ADITIVO', url: 'https://pncp.gov.br/ata2', dataPublicacaoPncp: '2026-01-15T10:00:00' },
          { sequencialDocumento: 3, titulo: 'Reajustar os valores unitários', url: 'https://pncp.gov.br/ata3', dataPublicacaoPncp: '2026-04-28T10:00:00' }
        ]);
      }
      if (url === 'https://pncp.gov.br/ata2') return new Response(PDF(texto));
      return undefined;
    });
    await sincronizarReajusteAtas({ leitor: leitorFalso({}), fetcher: fetcher as unknown as typeof fetch, esperar: sem });
    const ata = (banco.gravacoes[1].atas as Array<Record<string, unknown>>)[0];
    expect(ata.documentos_lidos).toEqual([2, 3]);
    expect(ata.reajustes).toEqual([expect.objectContaining({ documento_pncp_sequencial: 2, percentual: 5.17 })]);
  });

  it('edital que já derrubou a leitura duas vezes fica a conferir, sem baixar', async () => {
    (banco.fila[0] as Record<string, unknown>).edital_tentativas = 2;
    const fetcher = fontes();
    const r = await sincronizarReajusteAtas({ leitor: leitorFalso({}), fetcher: fetcher as unknown as typeof fetch, esperar: sem });
    expect(fetcher.mock.calls.some(([u]) => u === 'https://pncp.gov.br/edital' || String(u).endsWith('/compras/2024/1132/arquivos'))).toBe(false);
    expect(banco.gravacoes[2]).toEqual({ atas: [{ ata_id: 'ata-1', clausula: 'A_CONFERIR' }] });
    expect(r).toMatchObject({ status: 'PARCIAL', total: 1 });
    expect((r as { mensagem: string }).mensagem).toMatch(/o edital da ata 00093\/2024 ficou a conferir/);
  });

  it('índices lidos há menos de 20 horas não são lidos de novo', async () => {
    banco.indices = [{ lido_em: '2026-10-23T09:00:00Z' }];
    const fetcher = fontes();
    await sincronizarReajusteAtas({ leitor: leitorFalso({}), fetcher: fetcher as unknown as typeof fetch, esperar: sem, hoje: () => new Date('2026-10-23T12:00:00Z') });
    expect(fetcher.mock.calls.some(([u]) => String(u).includes('sgs.433') || String(u).includes('olinda'))).toBe(false);
    expect(banco.gravacoes.some((g) => 'indices' in g)).toBe(false);
    banco.indices = [];
  });

  it('sem o lote do Compras.gov.br, o preço homologado vem item por item do PNCP', async () => {
    const fetcher = fontes((url) => (url.includes('3_consultarResultadoItensContratacoes') ? new Response('', { status: 503 }) : undefined));
    const r = await sincronizarReajusteAtas({ leitor: leitorFalso({}), fetcher: fetcher as unknown as typeof fetch, esperar: sem });
    expect(fetcher.mock.calls.some(([u]) => String(u).endsWith('/itens/1/resultados'))).toBe(true);
    expect((banco.gravacoes[1].atas as Array<Record<string, unknown>>)[0].homologados).toEqual([{ numero_item: '00001', valor: 14695 }]);
    expect(r).toMatchObject({ status: 'PARCIAL', fontesComFalha: ['Compras.gov.br (resultado dos itens)'] });
  });

  it('documento já lido não é baixado de novo', async () => {
    (banco.fila[0] as Record<string, unknown>).documentos_pncp_lidos = [1, 3];
    (banco.fila[0] as Record<string, unknown>).edital_lido_em = '2026-10-22T00:00:00Z';
    const fetcher = fontes();
    await sincronizarReajusteAtas({ leitor: leitorFalso({}), fetcher: fetcher as unknown as typeof fetch, esperar: sem });
    expect(fetcher.mock.calls.some(([u]) => u === 'https://pncp.gov.br/ata3' || u === 'https://pncp.gov.br/edital')).toBe(false);
    expect(banco.gravacoes[1].atas).toEqual([expect.objectContaining({ documentos_lidos: [], reajustes: [] })]);
  });

  it('página de bloqueio do PNCP para a execução e deixa o resto para depois', async () => {
    banco.fila = [banco.fila[0], { ...(banco.fila[0] as object), ata_id: 'ata-2' }];
    const fetcher = fontes((url) => (url.includes('/compras/2024/1132/arquivos') ? new Response('<html>bloqueado</html>') : undefined));
    const r = await sincronizarReajusteAtas({ leitor: leitorFalso({}), fetcher: fetcher as unknown as typeof fetch, esperar: sem });
    expect(r).toMatchObject({ status: 'PARCIAL', total: 0, fontesComFalha: ['PNCP (editais e apostilamentos)'] });
    expect((r as { mensagem: string }).mensagem).toMatch(/1 ata não pôde ser lida .*bloqueio.* e 1 ata ficou para a próxima execução/);
  });

  it('falha do Banco Central não impede a leitura das atas e não tenta de novo', async () => {
    const fetcher = fontes((url) => (url.includes('sgs.433') ? new Response('', { status: 503 }) : undefined));
    const r = await sincronizarReajusteAtas({ leitor: leitorFalso({}), fetcher: fetcher as unknown as typeof fetch, esperar: sem });
    expect(r).toMatchObject({ status: 'PARCIAL', total: 1, fontesComFalha: ['Banco Central (IPCA e Focus)'] });
    // Sem índices: só as gravações da ata (arquivos e homologado, tentativa do edital, edital).
    expect(banco.gravacoes).toHaveLength(3);
    expect(banco.gravacoes.some((g) => 'indices' in g)).toBe(false);
    // Leitura rápida: uma tentativa só no Banco Central.
    expect(fetcher.mock.calls.filter(([u]) => String(u).includes('sgs.433'))).toHaveLength(1);
  });

  it('página de bloqueio do Banco Central: uma tentativa e segue', async () => {
    const fetcher = fontes((url) => (url.includes('sgs.433') ? new Response('<html>bloqueado</html>') : undefined));
    const r = await sincronizarReajusteAtas({ leitor: leitorFalso({}), fetcher: fetcher as unknown as typeof fetch, esperar: sem });
    expect(fetcher.mock.calls.filter(([u]) => String(u).includes('sgs.433'))).toHaveLength(1);
    expect(r).toMatchObject({ status: 'PARCIAL', total: 1 });
    expect((r as { mensagem: string }).mensagem).toMatch(/valem os da última leitura/);
  });

  it('sem tempo, a ata fica para a próxima execução', async () => {
    let t = 0;
    const r = await sincronizarReajusteAtas({ leitor: leitorFalso({}), fetcher: fontes() as unknown as typeof fetch, esperar: sem, orcamentoMs: 20_000, agora: () => (t += 10_000) });
    expect(r).toMatchObject({ status: 'PARCIAL', total: 0 });
    expect((r as { mensagem: string }).mensagem).toMatch(/1 ata ficou para a próxima execução/);
  });
});
