import { describe, it, expect, vi, beforeEach } from 'vitest';

// Banco simulado: só as chamadas que o serviço usa.
const banco = vi.hoisted(() => ({
  fila: [] as unknown[],
  gravacoes: [] as Array<Record<string, unknown>>,
  itens: [] as Array<{ numero_item: string; fornecedor_cnpj_cpf: string | null }>,
  homologados: [] as Array<{ numero_item: string }>
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
      select: () => ({
        eq: async () => ({ data: tabela === 'itens_ata' ? banco.itens : banco.homologados, error: null })
      })
    }))
  }
}));

vi.mock('../sincronizacaoFontesService', async (original) => ({
  ...(await original<typeof import('../sincronizacaoFontesService')>()),
  executarComReserva: vi.fn(async (_r: string, _u: string, _o: unknown, tarefa: () => Promise<unknown>) => tarefa())
}));

import { lerIndicesIpca, partesDoControle, sincronizarReajusteAtas, textosDoArquivo, type LeitorDeArquivos } from '../reajusteAtasSyncService';

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
    expect(banco.gravacoes[1]).toEqual({
      atas: [{
        ata_id: 'ata-1',
        clausula: 'COM_REAJUSTE',
        indice: 'IPCA',
        data_orcamento_edital: '2024-09-30',
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

  it('falha do Banco Central não impede a leitura das atas', async () => {
    const fetcher = fontes((url) => (url.includes('sgs.433') ? new Response('', { status: 503 }) : undefined));
    const r = await sincronizarReajusteAtas({ leitor: leitorFalso({}), fetcher: fetcher as unknown as typeof fetch, esperar: sem });
    expect(r).toMatchObject({ status: 'PARCIAL', total: 1, fontesComFalha: ['Banco Central (IPCA e Focus)'] });
    expect(banco.gravacoes).toHaveLength(1);
  });

  it('sem tempo, a ata fica para a próxima execução', async () => {
    let t = 0;
    const r = await sincronizarReajusteAtas({ leitor: leitorFalso({}), fetcher: fontes() as unknown as typeof fetch, esperar: sem, orcamentoMs: 20_000, agora: () => (t += 10_000) });
    expect(r).toMatchObject({ status: 'PARCIAL', total: 0 });
    expect((r as { mensagem: string }).mensagem).toMatch(/1 ata ficou para a próxima execução/);
  });
});
