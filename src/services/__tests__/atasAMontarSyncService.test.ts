import { describe, expect, it, vi } from 'vitest';
import {
  buscarComprasHomologadas,
  enderecoDoArquivo,
  leituraDoTexto,
  lerItensDaCompra,
  pdfsDaMinuta,
  testarAtasAMontar,
  type BancoDasAtasAMontar,
  type CompraParaGravar,
  type ItemDaCompra
} from '../atasAMontarSyncService';
import type { LeitorDeArquivos } from '../reajusteAtasSyncService';

vi.mock('../supabaseClient', () => ({ supabase: null }));

const ARQUIVOS = import.meta.glob('./fixtures/minutas/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MINUTA_1664 = ARQUIVOS['./fixtures/minutas/minuta_2025_1664.txt'];

const json = (corpo: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(corpo), { status });
const semEspera = async () => {};

/** fetch de mentira: responde pela parte do endereço. */
function fetcherDe(rotas: Array<[RegExp, () => Response]>): typeof fetch {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    const rota = rotas.find(([re]) => re.test(u));
    return rota ? rota[1]() : new Response('', { status: 404 });
  }) as unknown as typeof fetch;
}

const COMPRA: CompraParaGravar = {
  numero_controle_compra: '00394494000136-1-001664/2025',
  codigo_uasg: '200331',
  ano_compra: 2025,
  sequencial_compra: 1664,
  numero_compra: '90035',
  processo: '08020.005782/2025-11',
  objeto: 'Drones'
};

const resultado = (ni: string, nome: string, q: number, vu: number, situacao = 1) => ({
  niFornecedor: ni,
  nomeRazaoSocialFornecedor: nome,
  quantidadeHomologada: q,
  valorUnitarioHomologado: vu,
  valorTotalHomologado: q * vu,
  dataResultado: '2026-08-26',
  situacaoCompraItemResultadoId: situacao
});

describe('buscarComprasHomologadas', () => {
  it('fica só com pregão de registro de preços divulgado e com valor homologado', async () => {
    const compra = (seq: number, extra: object) => ({ anoCompra: 2026, sequencialCompra: seq, numeroCompra: String(90000 + seq), srp: true, situacaoCompraId: 1, valorTotalHomologado: 10, ...extra });
    const fetcher = fetcherDe([
      [/codigoUnidadeAdministrativa=200331/, () => json({ totalPaginas: 1, data: [compra(1, {}), compra(2, { srp: false }), compra(3, { situacaoCompraId: 4 }), compra(4, { valorTotalHomologado: null })] })],
      [/codigoUnidadeAdministrativa=200330/, () => json({ totalPaginas: 1, data: [] })]
    ]);
    const r = await buscarComprasHomologadas({ fetcher, esperar: semEspera }, new Date('2026-10-28T12:00:00Z'));
    expect(r.map((c) => c.numero_controle_compra)).toEqual(['00394494000136-1-000001/2026']);
    // 18 meses em janelas de até 365 dias: 2 pedidos por UASG.
    expect((fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(4);
  });
});

describe('lerItensDaCompra', () => {
  it('lê o resultado só dos itens que têm e deixa de fora o resultado cancelado', async () => {
    const fetcher = fetcherDe([
      [/itens\/1\/resultados/, () => json([resultado('13373898000438', 'GOHOBBY', 4094, 45200), resultado('11111111000111', 'OUTRA', 1, 1, 2)])],
      [/itens\?pagina=1/, () => json([
        { numeroItem: 1, descricao: 'Aeronaves Teleguiadas', unidadeMedida: 'Unidade', quantidade: 4094, temResultado: true },
        { numeroItem: 2, descricao: 'Aeronaves Teleguiadas', unidadeMedida: 'Unidade', quantidade: 1377, temResultado: false }
      ])]
    ]);
    const itens = await lerItensDaCompra(COMPRA, { fetcher, esperar: semEspera }, () => 60_000);
    expect(itens).toHaveLength(2);
    expect(itens?.[0].resultados).toEqual([expect.objectContaining({ fornecedor_ni: '13373898000438', quantidade: 4094, valor_unitario: 45200, data_resultado: '2026-08-26' })]);
    expect(itens?.[1].resultados).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('sem tempo para os resultados, a compra fica para a próxima (null, nada pela metade)', async () => {
    const fetcher = fetcherDe([[/itens\?pagina=1/, () => json([{ numeroItem: 1, quantidade: 1, temResultado: true }])]]);
    expect(await lerItensDaCompra(COMPRA, { fetcher, esperar: semEspera }, () => 1_000)).toBeNull();
  });
});

describe('leituraDoTexto', () => {
  const item = (numero: number, quantidade: number, comResultado = true): ItemDaCompra => ({
    numero, descricao: 'Aeronaves', unidade: 'Unidade', quantidade, situacao: null, catalogo_codigo: null,
    resultados: comResultado ? [{ fornecedor_ni: '13373898000438', fornecedor_nome: 'GOHOBBY', quantidade, valor_unitario: 1, valor_total: quantidade, data_resultado: null, moeda_estrangeira: null, valor_moeda_estrangeira: null }] : []
  });

  it('todas as somas fecham: LIDA, com descrição, CATMAT, gerenciador e um participante por UASG', () => {
    const r = leituraDoTexto(MINUTA_1664, [item(1, 4094), item(2, 1377)], 'minuta.pdf');
    expect(r.estado).toBe('LIDA');
    expect(r.leitura.modelo).toBe('B');
    expect(r.leitura.itens['1']).toMatchObject({ descricao: 'AERONAVE REMOTAMENTE PILOTADA TIPO I', catmat: '482665', gerenciador: 1896, fecha: true });
    const uasgs = r.leitura.itens['1'].participantes.map((p) => p.uasg);
    expect(new Set(uasgs).size).toBe(uasgs.length);
  });

  it('soma que não fecha num item homologado: A_CONFERIR', () => {
    const r = leituraDoTexto(MINUTA_1664, [item(1, 4095), item(2, 1377)], 'minuta.pdf');
    expect(r.estado).toBe('A_CONFERIR');
    expect(r.leitura.itens['1'].fecha).toBe(false);
  });

  it('item sem resultado (fracassado) não deixa a minuta a conferir', () => {
    const r = leituraDoTexto(MINUTA_1664, [item(1, 4094), item(2, 1378, false)], 'minuta.pdf');
    expect(r.estado).toBe('LIDA');
  });

  it('texto sem a seção 3: SEM_MINUTA', () => {
    expect(leituraDoTexto('Edital sem minuta', [item(1, 10)], 'edital.pdf').estado).toBe('SEM_MINUTA');
  });
});

describe('enderecoDoArquivo', () => {
  it('tira a porta interna do endereço do PNCP', () => {
    expect(enderecoDoArquivo('https://pncp.gov.br:14986/pncp-api/v1/orgaos/00394494000136/compras/2025/1664/arquivos/5'))
      .toBe('https://pncp.gov.br/pncp-api/v1/orgaos/00394494000136/compras/2025/1664/arquivos/5');
    expect(enderecoDoArquivo('https://pncp.gov.br/pncp-api/x')).toBe('https://pncp.gov.br/pncp-api/x');
  });
});

describe('pdfsDaMinuta', () => {
  it('no pacote do edital, a minuta da ata vem antes do edital; inglês, ETP e contrato ficam de fora', async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
    const nomes = [
      'Edital_de_Licitacao_PE_n_90039_2025.pdf',
      'Anexo_III_-_Minuta_de_Ata_de_Registro_de_Pre_os_n__33_2025.pdf',
      'Annex_III_-_Draft_of_Price_Registration_Record.pdf',
      'Anexo_III_do_ETP_-Ata_de_Registro_de_Pre_os_n__49-2025.pdf',
      'Anexo_II_-_Minuta_de_Termo_de_Contrato.pdf'
    ];
    const leitor: LeitorDeArquivos = {
      textoDoPdf: async () => '',
      arquivosDoZip: async (_b, aceitar) => nomes.filter((n) => !aceitar || aceitar(n, 10)).map((nome) => ({ nome, bytes: pdf }))
    };
    const r = await pdfsDaMinuta(zip, leitor);
    expect(r.map((p) => p.nome)).toEqual(['Anexo_III_-_Minuta_de_Ata_de_Registro_de_Pre_os_n__33_2025.pdf', 'Edital_de_Licitacao_PE_n_90039_2025.pdf']);
  });
});

describe('testarAtasAMontar (sem gravar)', () => {
  it('lê itens e minuta e não grava no banco', async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const fetcher = fetcherDe([
      [/contratacoes\/publicacao.*200331/, () => json({ totalPaginas: 1, data: [{ anoCompra: 2025, sequencialCompra: 1664, numeroCompra: '90035', srp: true, situacaoCompraId: 1, valorTotalHomologado: 1 }] })],
      [/contratacoes\/publicacao/, () => json({ totalPaginas: 1, data: [] })],
      [/itens\/1\/resultados/, () => json([resultado('13373898000438', 'GOHOBBY', 4094, 45200)])],
      [/itens\/2\/resultados/, () => json([resultado('13373898000438', 'GOHOBBY', 1377, 9671)])],
      [/itens\?pagina=1/, () => json([{ numeroItem: 1, quantidade: 4094, temResultado: true }, { numeroItem: 2, quantidade: 1377, temResultado: true }])],
      [/\/arquivos$/, () => json([{ sequencialDocumento: 5, tipoDocumentoNome: 'Edital', titulo: 'Edital', url: 'https://pncp/arquivo/5' }])],
      [/arquivo\/5/, () => new Response(pdf, { status: 200 })]
    ]);
    const banco: BancoDasAtasAMontar = { fila: vi.fn(async () => []), gravar: vi.fn(async () => {}), temFornecedorSemAta: vi.fn(async () => true) };
    const leitor: LeitorDeArquivos = { textoDoPdf: async () => MINUTA_1664, arquivosDoZip: async () => [] };
    let t = 0;
    const r = await testarAtasAMontar({ leitor, banco, fetcher, esperar: semEspera, agora: () => (t += 10), hoje: () => new Date('2026-10-28T12:00:00Z') });
    expect(banco.gravar).not.toHaveBeenCalled();
    expect(r).toMatchObject({ itensLidos: 1, minutasLidas: 1, falhas: [], pregoes: ['90035/2025'] });
    expect(r.leituras).toEqual([
      expect.objectContaining({ compra: '90035/2025', itens: 2, fornecedores: ['GOHOBBY'] }),
      expect.objectContaining({ compra: '90035/2025', minuta: expect.objectContaining({ estado: 'LIDA', modelo: 'B' }) })
    ]);
  });
});
