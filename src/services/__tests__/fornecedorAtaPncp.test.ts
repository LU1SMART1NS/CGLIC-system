import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  candidatosDaCompra,
  fetchArpItems,
  fetchAtasSoNoPncp,
  limparCachesAtas,
  normalizarIdentificadorFornecedor,
  type PendenciaFornecedorPncp
} from '../api';
import { fornecedorDosItens, indicacoesPorControle, registroDaLinha, type RegistroFornecedorPncp } from '../fornecedorAtaPncpService';
import { buildAtaActionQueue, pendenciaDeFornecedor } from '../ataActionQueueService';
import { calculateAttentionSummary } from '../dashboardService';
import type { ArpItemRecord, ArpRecord } from '../../types';

/**
 * Caso real de 09/10/2026: a compra 1667/2025 (pregão 90039/2025) gerou as atas 00042/2026 (TEXPORT, itens 1 e 2) e
 * 00043/2026 (ITURRI, item 3). O PNCP publicou as duas sem fornecedor e o Compras.gov.br ainda não as tinha. O item 1
 * não tinha resultado publicado. Os fornecedores são estrangeiros: o PNCP os identifica por "ESTRANG…", sem CNPJ.
 */

const CNPJ = '00394494000136';
const CTRL_42 = `${CNPJ}-1-001667/2025-000001`;
const CTRL_43 = `${CNPJ}-1-001667/2025-000002`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const ataDaLista = (numero: string, seqAta: number) => ({
  numeroControlePNCPAta: `${CNPJ}-1-001667/2025-${String(seqAta).padStart(6, '0')}`,
  numeroControlePNCPCompra: `${CNPJ}-1-001667/2025`,
  numeroAtaRegistroPreco: numero,
  anoAta: 2026,
  cancelado: false,
  dataAssinatura: '2026-09-09',
  vigenciaInicio: '2026-09-10',
  vigenciaFim: '2027-09-10',
  dataPublicacaoPncp: '2026-09-09T11:51:23',
  nomeUnidadeOrgao: 'SECRETARIA NACIONAL DE SEGURANCA PUBLICA'
});

const RESULTADOS: Record<number, unknown[] | null> = {
  1: null,
  2: [{ niFornecedor: 'ESTRANG0000486', nomeRazaoSocialFornecedor: 'TEXPORT Handelsgesellschaft m.b.H.', quantidadeHomologada: 22733, valorUnitarioHomologado: 647.46, valorTotalHomologado: 14718708.18 }],
  3: [{ niFornecedor: 'ESTRANG0000440', nomeRazaoSocialFornecedor: 'ITURRI S.A.', quantidadeHomologada: 16896, valorUnitarioHomologado: 1416.97, valorTotalHomologado: 23941125.12 }]
};

function mockPncp(opcoes: { comprasGov?: unknown[] } = {}) {
  const chamadas: string[] = [];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
    chamadas.push(url);
    if (url.startsWith('/api-pncp/api/consulta/v1/atas?')) {
      const q = new URLSearchParams(url.split('?')[1]);
      // Janela do último ano tem as atas; a do próximo ano vem vazia.
      if (String(q.get('dataInicial')) > '20260601') return new Response(null, { status: 204 });
      return json({ data: [ataDaLista('00042', 1), ataDaLista('00043', 2)], totalPaginas: 1 });
    }
    if (/\/consulta\/v1\/orgaos\/\d+\/compras\/2025\/1667$/.test(url)) return json({ numeroCompra: '90039', modalidadeId: 6, modalidadeNome: 'Pregão - Eletrônico' });
    if (/\/compras\/2025\/1667\/atas$/.test(url)) return json({ data: [{ sequencialAta: 1 }, { sequencialAta: 2 }], totalRegistros: 2 });
    if (/\/compras\/2025\/1667\/itens\?tamanhoPagina=500$/.test(url)) {
      return json([
        { numeroItem: 1, descricao: 'Vestuário Proteção', quantidade: 21915, valorUnitarioEstimado: 10941.08 },
        { numeroItem: 2, descricao: 'Touca', quantidade: 22733, valorUnitarioEstimado: 1018.13 },
        { numeroItem: 3, descricao: 'Vestuário Proteção', quantidade: 16896, valorUnitarioEstimado: 3779.8 }
      ]);
    }
    const res = url.match(/\/itens\/(\d+)\/resultados$/);
    if (res) {
      const r = RESULTADOS[Number(res[1])];
      return r ? json(r) : new Response(null, { status: 204 });
    }
    if (url.startsWith('/api-arp/')) return json({ resultado: opcoes.comprasGov || [], paginasRestantes: 0 });
    throw new Error(`URL não prevista no teste: ${url}`);
  }));
  return chamadas;
}

const AGORA = new Date('2026-10-09T12:00:00Z');

describe('normalizarIdentificadorFornecedor', () => {
  it('CNPJ fica só com dígitos; fornecedor estrangeiro mantém o código inteiro', () => {
    expect(normalizarIdentificadorFornecedor('03.871.566/0003-49')).toBe('03871566000349');
    expect(normalizarIdentificadorFornecedor('estrang0000440')).toBe('ESTRANG0000440');
    expect(normalizarIdentificadorFornecedor(undefined)).toBe('');
  });
});

describe('fetchAtasSoNoPncp — ata publicada sem fornecedor', () => {
  beforeEach(() => limparCachesAtas());
  afterEach(() => vi.unstubAllGlobals());

  it('sem indicação: as duas atas entram sem itens e a pendência traz os fornecedores com resultado e o item sem resultado', async () => {
    mockPncp();
    const pendencias: PendenciaFornecedorPncp[] = [];
    const atas = await fetchAtasSoNoPncp('200331', [], AGORA, Date.now() + 60_000, { aoDetectarPendencia: (p) => pendencias.push(p) });

    expect(atas.map((a) => [a.numeroAtaRegistroPreco, a.quantidadeItens, a.valorTotal])).toEqual([['00042/2026', 0, 0], ['00043/2026', 0, 0]]);
    expect(pendencias.map((p) => p.numeroControlePncpAta).sort()).toEqual([CTRL_42, CTRL_43]);
    const p43 = pendencias.find((p) => p.numeroControlePncpAta === CTRL_43)!;
    expect(p43).toMatchObject({ numeroAta: '00043/2026', uasg: '200331', numeroCompra: '90039', anoCompra: '2025', atasNaCompra: 2, numeroControlePncpCompra: `${CNPJ}-1-001667/2025` });
    expect(p43.candidatos.map((c) => [c.identificador, c.nome, c.itens.map((i) => i.numeroItem)])).toEqual([
      ['ESTRANG0000486', 'TEXPORT Handelsgesellschaft m.b.H.', [2]],
      ['ESTRANG0000440', 'ITURRI S.A.', [3]]
    ]);
    expect(p43.candidatos[1].itens[0]).toEqual({ numeroItem: 3, descricao: 'Vestuário Proteção', quantidade: 16896, valorUnitario: 1416.97, valorTotal: 23941125.12 });
    expect(p43.itensSemResultado).toEqual([{ numeroItem: 1, descricao: 'Vestuário Proteção', quantidade: 21915 }]);
  });

  it('com a indicação do coordenador: a 43 recebe só o item da ITURRI, pelo código de estrangeiro inteiro, e a 42 continua pendente', async () => {
    mockPncp();
    const pendencias: PendenciaFornecedorPncp[] = [];
    const atas = await fetchAtasSoNoPncp('200331', [], AGORA, Date.now() + 60_000, {
      fornecedorIndicado: (ctrl) => (ctrl === CTRL_43 ? 'ESTRANG0000440' : undefined),
      aoDetectarPendencia: (p) => pendencias.push(p)
    });
    const a43 = atas.find((a) => a.numeroAtaRegistroPreco === '00043/2026')!;
    expect(a43.quantidadeItens).toBe(1);
    expect(a43.valorTotal).toBeCloseTo(23941125.12, 2);
    expect(pendencias.map((p) => p.numeroControlePncpAta)).toEqual([CTRL_42]);
  });

  it('indicação com só os dígitos não casa com o código de estrangeiro (a comparação é do identificador inteiro)', async () => {
    mockPncp();
    const atas = await fetchAtasSoNoPncp('200331', [], AGORA, Date.now() + 60_000, { fornecedorIndicado: () => '0000440' });
    expect(atas.every((a) => a.quantidadeItens === 0)).toBe(true);
  });
});

describe('fetchArpItems — origem dos itens e fornecedor indicado', () => {
  beforeEach(() => limparCachesAtas());
  afterEach(() => vi.unstubAllGlobals());

  const ctx43 = { numeroControlePncpAta: CTRL_43, anoCompra: '2025', numeroCompra: '90039' };

  it('PNCP com fornecedor indicado: itens do fornecedor, origem PNCP', async () => {
    mockPncp();
    const r = await fetchArpItems('2026-09-10', '200331', '00043/2026', ctx43, { estrito: true, fornecedorIndicado: (ctrl) => (ctrl === CTRL_43 ? 'ESTRANG0000440' : undefined) });
    expect(r.origem).toBe('PNCP');
    expect(r.resultado.map((i) => [i.numeroItem, i.niFornecedor, i.quantidadeHomologadaItem])).toEqual([['00003', 'ESTRANG0000440', 16896]]);
  });

  it('sem indicação: ata sem itens e a pendência é informada com o número de controle da ata', async () => {
    mockPncp();
    const pendencias: PendenciaFornecedorPncp[] = [];
    const r = await fetchArpItems('2026-09-10', '200331', '00043/2026', ctx43, { estrito: true, aoDetectarPendencia: (p) => pendencias.push(p) });
    expect(r.resultado).toEqual([]);
    expect(pendencias).toHaveLength(1);
    expect(pendencias[0]).toMatchObject({ numeroControlePncpAta: CTRL_43, numeroCompra: '90039', atasNaCompra: 2 });
  });

  it('Compras.gov.br publicou a ata: os itens vêm de lá, origem COMPRAS_GOV, sem consultar o PNCP', async () => {
    const chamadas = mockPncp({
      comprasGov: [{ numeroAtaRegistroPreco: '00043/2026', numeroItem: '00003', niFornecedor: 'ESTRANG0000440', nomeRazaoSocialFornecedor: 'ITURRI S.A.', quantidadeHomologadaItem: 16896, valorUnitario: 1416.97 }]
    });
    const r = await fetchArpItems('2026-09-10', '200331', '00043/2026', ctx43, { estrito: true, fornecedorIndicado: () => 'ESTRANG0000440' });
    expect(r.origem).toBe('COMPRAS_GOV');
    expect(r.resultado).toHaveLength(1);
    expect(chamadas.some((u) => u.startsWith('/api-pncp/'))).toBe(false);
  });
});

describe('candidatosDaCompra e fornecedorDosItens', () => {
  const item = (n: number, ni: string, nome: string): ArpItemRecord => ({ numeroItem: String(n).padStart(5, '0'), niFornecedor: ni, nomeRazaoSocialFornecedor: nome, descricaoItem: `Item ${n}`, quantidadeHomologadaItem: 10, valorUnitario: 2, valorTotal: 20 } as ArpItemRecord);

  it('agrupa por fornecedor (matriz e filial são o mesmo CNPJ só se iguais) e separa os itens sem resultado', () => {
    const r = candidatosDaCompra([item(1, '', ''), item(2, '11.111.111/0001-11', 'ACME'), item(3, '11111111000111', 'ACME'), item(4, 'ESTRANG0000440', 'ITURRI')]);
    expect(r.candidatos.map((c) => [c.identificador, c.itens.map((i) => i.numeroItem)])).toEqual([['11111111000111', [2, 3]], ['ESTRANG0000440', [4]]]);
    expect(r.itensSemResultado.map((i) => i.numeroItem)).toEqual([1]);
  });

  it('fornecedorDosItens: o primeiro item com identificador', () => {
    expect(fornecedorDosItens([item(1, '', ''), item(2, 'estrang0000440', 'ITURRI')])).toEqual({ identificador: 'ESTRANG0000440', nome: 'ITURRI' });
    expect(fornecedorDosItens([item(1, '', '')])).toBeNull();
  });
});

const registro = (extra: Partial<RegistroFornecedorPncp> = {}): RegistroFornecedorPncp => ({
  numeroControlePncp: CTRL_43,
  numeroAta: '00043/2026',
  codigoUasg: '200331',
  numeroCompra: '90039',
  anoCompra: '2025',
  atasNaCompra: 2,
  estado: 'PENDENTE',
  candidatos: [],
  itensSemResultado: [],
  detectadoEm: '2026-10-09T13:00:00Z',
  atualizadoEm: '2026-10-09T13:00:00Z',
  ...extra
});

describe('registroDaLinha e indicacoesPorControle', () => {
  it('converte a linha do banco e só as indicações (não pendentes) entram no mapa', () => {
    const linha = registroDaLinha({
      numero_controle_pncp: CTRL_43, numero_ata: '00043/2026', codigo_uasg: '200331', numero_controle_pncp_compra: null, numero_compra: '90039', ano_compra: '2025',
      atas_na_compra: 2, estado: 'INDICADO',
      candidatos: [{ identificador: 'ESTRANG0000440', nome: 'ITURRI S.A.', itens: [{ numero_item: 3, descricao: 'Vestuário Proteção', quantidade: 16896, valor_unitario: 1416.97, valor_total: 23941125.12 }] }],
      itens_sem_resultado: [{ numero_item: 1, descricao: 'Vestuário Proteção', quantidade: 21915 }],
      fornecedor_identificador: 'ESTRANG0000440', fornecedor_nome: 'ITURRI S.A.', como_confirmou: 'PDF da ata no PNCP', indicado_por_nome: 'Luís', indicado_em: '2026-10-09T14:00:00Z',
      fonte_fornecedor_identificador: null, fonte_fornecedor_nome: null, conferido_em: null, detectado_em: '2026-10-09T13:00:00Z', atualizado_em: '2026-10-09T14:00:00Z'
    });
    expect(linha.candidatos[0].itens[0]).toEqual({ numeroItem: 3, descricao: 'Vestuário Proteção', quantidade: 16896, valorUnitario: 1416.97, valorTotal: 23941125.12 });
    expect(linha.itensSemResultado).toEqual([{ numeroItem: 1, descricao: 'Vestuário Proteção', quantidade: 21915 }]);
    expect(indicacoesPorControle([linha, registro({ numeroControlePncp: CTRL_42 })])).toEqual(new Map([[CTRL_43, 'ESTRANG0000440']]));
  });
});

const arp43 = {
  numeroAtaRegistroPreco: '00043/2026',
  codigoUnidadeGerenciadora: '200331',
  numeroControlePncpAta: CTRL_43,
  numeroCompra: '90039',
  anoCompra: '2025',
  dataVigenciaInicial: '2026-09-10',
  dataVigenciaFinal: '2027-09-10',
  objeto: 'EPI para incêndio'
} as ArpRecord;

describe('fila de ações da Ata 360 — pendência de fornecedor', () => {
  it('pendente: atenção, sem chave de Resolvido, com o botão do coordenador', () => {
    const item = pendenciaDeFornecedor(arp43, registro(), 0)!;
    expect(item).toMatchObject({ kind: 'CADASTRO', severity: 'ATENCAO', title: 'Fornecedor não informado pelo PNCP', fornecedorEstado: 'PENDENTE' });
    expect(item.description).toContain('a compra 90039/2025 gerou 2 atas');
    expect(item.avisoChave).toBeUndefined();
    const fila = buildAtaActionQueue({ arp: arp43, fornecedorPncp: registro(), currentDate: new Date('2026-10-09T12:00:00') });
    expect(fila.items[0].id).toBe(`ATA-FORNECEDOR-${CTRL_43}`);
    expect(fila.counts.ATENCAO).toBe(1);
  });

  it('indicado sem itens no banco: informativo; com itens: nada; conferido: nada; divergente: urgente', () => {
    const indicado = registro({ estado: 'INDICADO', fornecedorIdentificador: 'ESTRANG0000440', fornecedorNome: 'ITURRI S.A.' });
    expect(pendenciaDeFornecedor(arp43, indicado, 0)).toMatchObject({ severity: 'INFO', title: 'Fornecedor indicado: ITURRI S.A.', fornecedorEstado: 'INDICADO' });
    expect(pendenciaDeFornecedor(arp43, indicado, 1)).toBeNull();
    expect(pendenciaDeFornecedor(arp43, registro({ estado: 'CONFERIDO', fornecedorIdentificador: 'ESTRANG0000440' }), 1)).toBeNull();
    expect(pendenciaDeFornecedor(arp43, registro({ estado: 'DIVERGENTE', fornecedorIdentificador: 'ESTRANG0000440', fornecedorNome: 'ITURRI S.A.', fonteFornecedorNome: 'TEXPORT' }), 1))
      .toMatchObject({ severity: 'URGENTE', fornecedorEstado: 'DIVERGENTE' });
    expect(pendenciaDeFornecedor(arp43, null, 0)).toBeNull();
  });
});

describe('Visão Geral — pendência de fornecedor', () => {
  it('só a ata em tela entra, pendente em atenção e divergente em urgente, com destino na aba Ações', () => {
    const outra = registro({ numeroControlePncp: CTRL_42, numeroAta: '00042/2026' });
    const resumo = calculateAttentionSummary({
      arps: [arp43],
      fornecedoresPncp: [registro(), outra, registro({ numeroControlePncp: 'x-conferido', estado: 'CONFERIDO', fornecedorIdentificador: 'a' })],
      currentDate: new Date('2026-10-09T12:00:00')
    });
    const itens = resumo.items.filter((i) => i.category === 'FORNECEDOR_PNCP');
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({
      id: `ATT-FORNECEDOR-${CTRL_43}`,
      severity: 'ATENCAO',
      numeroAta: '00043/2026',
      arpKey: '00043/2026-200331',
      targetUrl: '/atas/detalhe/00043%2F2026-200331?aba=acoes',
      badgeLabel: 'sem itens'
    });
    expect(itens[0].avisoChave).toBeUndefined();

    const divergente = calculateAttentionSummary({
      arps: [arp43],
      fornecedoresPncp: [registro({ estado: 'DIVERGENTE', fornecedorIdentificador: 'ESTRANG0000440', fornecedorNome: 'ITURRI S.A.', fonteFornecedorNome: 'TEXPORT' })],
      currentDate: new Date('2026-10-09T12:00:00')
    });
    expect(divergente.items.find((i) => i.category === 'FORNECEDOR_PNCP')).toMatchObject({ severity: 'URGENTE', badgeLabel: 'conferir itens' });
  });
});
