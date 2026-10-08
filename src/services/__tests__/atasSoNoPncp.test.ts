import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAtasSoNoPncp, fetchArpsDasFontes, limparCachesAtas } from '../api';

/**
 * Atas que o PNCP já publicou e o Compras.gov.br ainda não entrega. Em out/2026 as atas 00042, 00043 e 00044/2026
 * estavam no PNCP havia um mês e não apareciam no sistema: só entravam atas de uma lista fixa no código.
 */

const CNPJ = '00394494000136';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const ataDaLista = (numero: string, seqCompra: number, seqAta: number, extra: Record<string, unknown> = {}) => ({
  numeroControlePNCPAta: `${CNPJ}-1-${String(seqCompra).padStart(6, '0')}/2025-${String(seqAta).padStart(6, '0')}`,
  numeroControlePNCPCompra: `${CNPJ}-1-${String(seqCompra).padStart(6, '0')}/2025`,
  numeroAtaRegistroPreco: numero,
  anoAta: 2026,
  cancelado: false,
  dataAssinatura: '2026-09-09',
  vigenciaInicio: '2026-09-10',
  vigenciaFim: '2027-09-10',
  dataPublicacaoPncp: '2026-09-09T11:51:23',
  dataAtualizacaoGlobal: '2026-10-08T16:21:57',
  objetoContratacao: 'Equipamentos de proteção individual',
  nomeOrgao: 'MINISTERIO DA JUSTICA E SEGURANCA PUBLICA',
  codigoUnidadeOrgao: '200331',
  nomeUnidadeOrgao: 'SECRETARIA NACIONAL DE SEGURANCA PUBLICA',
  ...extra
});

interface Cenario {
  /** Atas devolvidas pela lista do PNCP, por página (só na janela do último ano). */
  paginas: unknown[][];
  /** Atas de cada compra (/compras/2025/{seq}/atas). */
  atasDaCompra?: Record<number, Array<{ sequencialAta: number; cancelado?: boolean }>>;
  listaFalha?: boolean;
  /** Atas do Compras.gov.br. */
  compras?: unknown[];
}

function mockPncp(c: Cenario) {
  const chamadas: string[] = [];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
    chamadas.push(url);
    if (url.startsWith('/api-pncp/api/consulta/v1/atas?')) {
      if (c.listaFalha) return new Response('', { status: 503 });
      const q = new URLSearchParams(url.split('?')[1]);
      if (q.get('dataInicial') !== '20251009') return new Response(null, { status: 204 }); // janela do próximo ano: vazia
      const pagina = Number(q.get('pagina'));
      return json({ data: c.paginas[pagina - 1] || [], totalPaginas: c.paginas.length });
    }
    const compra = url.match(/\/api-pncp\/api\/consulta\/v1\/orgaos\/\d+\/compras\/2025\/(\d+)$/);
    if (compra) return json({ numeroCompra: '90039', modalidadeId: 6, modalidadeNome: 'Pregão - Eletrônico', processo: '08020005997202524' });
    const atas = url.match(/\/compras\/2025\/(\d+)\/atas$/);
    if (atas) {
      const lista = c.atasDaCompra?.[Number(atas[1])] || [];
      return json({ data: lista, totalRegistros: lista.length });
    }
    if (/\/itens\?tamanhoPagina=500$/.test(url)) return json([{ numeroItem: 1, descricao: 'Touca', quantidade: 10, valorUnitarioEstimado: 1 }]);
    if (/\/itens\/\d+\/resultados$/.test(url)) return json([{ niFornecedor: '11111111000111', nomeRazaoSocialFornecedor: 'ACME', valorTotalHomologado: 500, quantidadeHomologada: 10 }]);
    if (url.startsWith('/api-arp/')) return json({ resultado: c.compras || [], paginasRestantes: 0 });
    throw new Error(`URL não prevista no teste: ${url}`);
  }));
  return chamadas;
}

const AGORA = new Date('2026-10-08T12:00:00Z');

describe('fetchAtasSoNoPncp', () => {
  beforeEach(() => limparCachesAtas());
  afterEach(() => vi.unstubAllGlobals());

  it('traz a ata que só está no PNCP, com o número da compra do Compras.gov.br, e ignora as já conhecidas', async () => {
    const chamadas = mockPncp({
      paginas: [[ataDaLista('00041', 1331, 1), ataDaLista('00043', 1667, 2)]],
      atasDaCompra: { 1667: [{ sequencialAta: 1 }, { sequencialAta: 2 }] }
    });
    const atas = await fetchAtasSoNoPncp('200331', [{ numeroAtaRegistroPreco: '00041/2026', numeroControlePncpAta: '' }], AGORA);

    expect(atas).toHaveLength(1);
    expect(atas[0]).toMatchObject({
      numeroAtaRegistroPreco: '00043/2026',
      codigoUnidadeGerenciadora: '200331',
      numeroCompra: '90039',
      anoCompra: '2025',
      nomeModalidadeCompra: 'Pregão - Eletrônico',
      idCompra: '20033105900392025',
      dataVigenciaInicial: '2026-09-10',
      dataVigenciaFinal: '2027-09-10',
      statusAta: 'Ata de Registro de Preços',
      numeroControlePncpAta: `${CNPJ}-1-001667/2025-000002`,
      numeroControlePncpCompra: `${CNPJ}-1-001667/2025`,
      isCanceladaPncp: false
    });
    // Compra com duas atas vigentes e fornecedor desconhecido: sem itens, e o valor não é inventado.
    expect(atas[0].quantidadeItens).toBe(0);
    expect(atas[0].valorTotal).toBe(0);
    expect(chamadas.some((u) => /\/compras\/2025\/1667\/itens/.test(u))).toBe(false);

    const lista = chamadas.filter((u) => u.startsWith('/api-pncp/api/consulta/v1/atas?')).map((u) => new URLSearchParams(u.split('?')[1]));
    expect(lista.map((q) => [q.get('dataInicial'), q.get('dataFinal')])).toEqual([['20251009', '20261008'], ['20261009', '20271008']]);
    expect(lista.every((q) => q.get('cnpj') === CNPJ && q.get('codigoUnidadeAdministrativa') === '200331')).toBe(true);
  });

  it('compra com uma ata só e um fornecedor: valor e quantidade de itens vêm dos itens', async () => {
    mockPncp({ paginas: [[ataDaLista('00044', 1664, 1)]], atasDaCompra: { 1664: [{ sequencialAta: 1 }] } });
    const [ata] = await fetchAtasSoNoPncp('200331', [], AGORA);
    expect(ata.numeroAtaRegistroPreco).toBe('00044/2026');
    expect(ata.quantidadeItens).toBe(1);
    expect(ata.valorTotal).toBe(500);
  });

  it('mesmo número publicado duas vezes (uma cancelada): fica a não cancelada', async () => {
    mockPncp({
      paginas: [[
        ataDaLista('00068', 1130, 17, { dataPublicacaoPncp: '2025-06-01T10:00:00' }),
        ataDaLista('00068', 1130, 7, { cancelado: true, dataPublicacaoPncp: '2024-12-27T10:00:00' })
      ]],
      atasDaCompra: { 1130: [{ sequencialAta: 7, cancelado: true }, { sequencialAta: 17 }] }
    });
    const atas = await fetchAtasSoNoPncp('200331', [], AGORA);
    expect(atas.map((a) => a.numeroControlePncpAta)).toEqual([`${CNPJ}-1-001130/2025-000017`]);
  });

  it('ata que o PNCP numera diferente (90068 x 00068/2024): reconhecida pelo número de controle, não entra de novo', async () => {
    mockPncp({ paginas: [[ataDaLista('90068', 1130, 17, { anoAta: 2024 })]] });
    const atas = await fetchAtasSoNoPncp('200331', [{ numeroAtaRegistroPreco: '00068/2024', numeroControlePncpAta: `${CNPJ}-1-001130/2025-000017` }], AGORA);
    expect(atas).toEqual([]);
  });

  it('ata cancelada: entra como Cancelada, sem consultar itens', async () => {
    const chamadas = mockPncp({ paginas: [[ataDaLista('00005', 1576, 1, { cancelado: true })]] });
    const [ata] = await fetchAtasSoNoPncp('200331', [], AGORA);
    expect(ata).toMatchObject({ numeroAtaRegistroPreco: '00005/2026', statusAta: 'Cancelada', isCanceladaPncp: true, quantidadeItens: 0 });
    expect(chamadas.some((u) => /\/compras\/2025\/1576\/(atas|itens)/.test(u))).toBe(false);
  });

  it('lê todas as páginas da lista', async () => {
    mockPncp({ paginas: [[ataDaLista('00042', 1667, 1)], [ataDaLista('00043', 1667, 2)]] });
    const atas = await fetchAtasSoNoPncp('200331', [], AGORA);
    expect(atas.map((a) => a.numeroAtaRegistroPreco).sort()).toEqual(['00042/2026', '00043/2026']);
  });

  it('UASG fora do CGLIC: não consulta o PNCP', async () => {
    const chamadas = mockPncp({ paginas: [] });
    expect(await fetchAtasSoNoPncp('999999', [], AGORA)).toEqual([]);
    expect(chamadas).toEqual([]);
  });
});

describe('fetchArpsDasFontes com o PNCP', () => {
  beforeEach(() => limparCachesAtas());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const params = { codigoUnidadeGerenciadora: '200331', dataVigenciaInicialMin: '2026-01-01', dataVigenciaInicialMax: '2026-12-31', numeroAtaRegistroPreco: '' };

  it('soma à lista do Compras.gov.br as atas que só estão no PNCP', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AGORA);
    mockPncp({ paginas: [[ataDaLista('00043', 1667, 2)]], atasDaCompra: { 1667: [{ sequencialAta: 1 }, { sequencialAta: 2 }] } });
    const atas = await fetchArpsDasFontes(params);
    expect(atas.map((a) => a.numeroAtaRegistroPreco)).toContain('00043/2026');
  });

  it('PNCP fora do ar: a lista do Compras.gov.br sai assim mesmo', async () => {
    vi.useFakeTimers();
    mockPncp({ paginas: [], listaFalha: true, compras: [{ numeroAtaRegistroPreco: '00041/2026', codigoUnidadeGerenciadora: '200331', dataVigenciaFinal: '2027-08-17' }] });
    const promessa = fetchArpsDasFontes(params);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await promessa).map((a) => a.numeroAtaRegistroPreco)).toEqual(['00041/2026']);
  });
});
