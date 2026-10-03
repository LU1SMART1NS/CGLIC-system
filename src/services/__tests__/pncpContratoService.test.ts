import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ContractDashboardRecord } from '../../types';
import {
  addDiasIso,
  ataDeOrigem,
  encontrarContratoPncp,
  fetchPncpContrato,
  montarBuscaPncpContrato,
  parseNumeroControlePncpContrato
} from '../pncpContratoService';

const contrato = (over: Partial<ContractDashboardRecord> = {}) =>
  ({
    id: '200331-00230-2026',
    numero: '00230/2026',
    ano: 2026,
    uasg: '200331',
    dataAssinatura: '2026-07-07',
    fonteDados: 'Contratos.gov.br',
    raw: { data_publicacao: '2026-07-08' },
    ...over
  }) as ContractDashboardRecord;

const registro = (over: Record<string, unknown> = {}) => ({
  numeroControlePNCP: '00394494000136-2-001220/2026',
  numeroContratoEmpenho: '00230',
  anoContrato: 2026,
  dataPublicacaoPncp: '2026-07-07T16:48:32',
  numeroControlePncpAta: '00394494000136-1-000916/2025-000001',
  ...over
});

describe('parseNumeroControlePncpContrato', () => {
  it('lê o Id PNCP do contrato', () => {
    expect(parseNumeroControlePncpContrato('00394494000136-2-001220/2026')).toEqual({ cnpj: '00394494000136', sequencial: 1220, ano: '2026' });
  });
  it('não aceita o Id de ata (-1-) nem texto inválido', () => {
    expect(parseNumeroControlePncpContrato('00394494000136-1-000916/2025-000001')).toBeNull();
    expect(parseNumeroControlePncpContrato('200331-2-000015/2026')).toBeNull();
    expect(parseNumeroControlePncpContrato(undefined)).toBeNull();
    expect(parseNumeroControlePncpContrato('')).toBeNull();
  });
});

describe('addDiasIso', () => {
  it('soma e subtrai dias atravessando mês e ano, sem depender do fuso', () => {
    expect(addDiasIso('2026-07-08', -5)).toBe('2026-07-03');
    expect(addDiasIso('2026-12-30', 5)).toBe('2027-01-04');
    expect(addDiasIso('2026-03-02', -3)).toBe('2026-02-27');
    expect(addDiasIso('2026-07-08T10:00:00', 0)).toBe('2026-07-08');
  });
});

describe('montarBuscaPncpContrato', () => {
  it('usa a publicação do Contratos.gov.br, com janela de 5 dias para cada lado', () => {
    expect(montarBuscaPncpContrato(contrato())).toEqual({
      cnpj: '00394494000136',
      numero: '230',
      ano: 2026,
      dataInicial: '20260703',
      dataFinal: '20260713'
    });
  });

  it('sem a publicação, parte da assinatura: 2 dias antes e 15 depois', () => {
    expect(montarBuscaPncpContrato(contrato({ raw: {} }))).toMatchObject({ dataInicial: '20260705', dataFinal: '20260722' });
  });

  it('número sem barra usa o ano do cadastro', () => {
    expect(montarBuscaPncpContrato(contrato({ numero: '230' }))).toMatchObject({ numero: '230', ano: 2026 });
  });

  it('não busca para UASG sem CNPJ cadastrado, número ilegível ou sem data de referência', () => {
    expect(montarBuscaPncpContrato(contrato({ uasg: '110099' }))).toBeNull();
    expect(montarBuscaPncpContrato(contrato({ numero: 'sem-numero', ano: '' as unknown as number }))).toBeNull();
    expect(montarBuscaPncpContrato(contrato({ raw: {}, dataAssinatura: undefined, dataVigenciaInicio: undefined }))).toBeNull();
  });
});

describe('encontrarContratoPncp', () => {
  it('acha pelo número sem zeros à esquerda e pelo ano, e devolve Id, divulgação e ata de origem', () => {
    expect(encontrarContratoPncp([registro({ numeroContratoEmpenho: '00099' }), registro()], '230', 2026)).toEqual({
      numeroControlePncp: '00394494000136-2-001220/2026',
      dataPublicacaoPncp: '2026-07-07',
      numeroControlePncpAta: '00394494000136-1-000916/2025-000001'
    });
  });

  it('o mesmo número em outro ano não vale', () => {
    expect(encontrarContratoPncp([registro({ anoContrato: 2025 })], '230', 2026)).toBeNull();
  });

  it('com dois registros iguais, não adivinha', () => {
    expect(encontrarContratoPncp([registro(), registro({ numeroControlePNCP: 'outro' })], '230', 2026)).toBeNull();
  });

  it('registro sem Id ou sem data de divulgação não vira informação', () => {
    expect(encontrarContratoPncp([registro({ dataPublicacaoPncp: undefined })], '230', 2026)).toBeNull();
    expect(encontrarContratoPncp([registro({ numeroControlePNCP: undefined })], '230', 2026)).toBeNull();
  });

  it('sem ata de origem, o campo não existe', () => {
    expect(encontrarContratoPncp([registro({ numeroControlePncpAta: null })], '230', 2026)).not.toHaveProperty('numeroControlePncpAta');
  });

  it('lista ausente não acha nada', () => {
    expect(encontrarContratoPncp(undefined, '230', 2026)).toBeNull();
  });
});

describe('fetchPncpContrato', () => {
  afterEach(() => vi.unstubAllGlobals());
  const resposta = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });

  it('com Id PNCP no cadastro, consulta direto o contrato', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resposta(registro()));
    vi.stubGlobal('fetch', fetchMock);
    const info = await fetchPncpContrato(contrato({ numeroControlePncp: '00394494000136-2-001220/2026' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api-pncp/api/pncp/v1/orgaos/00394494000136/contratos/2026/1220');
    expect(info?.dataPublicacaoPncp).toBe('2026-07-07');
  });

  it('sem Id, busca na lista do órgão pela janela e acha o contrato', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resposta({ data: [registro({ numeroContratoEmpenho: '00001' }), registro()], totalPaginas: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const info = await fetchPncpContrato(contrato());
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api-pncp/api/consulta/v1/contratos?dataInicial=20260703&dataFinal=20260713&cnpjOrgao=00394494000136&pagina=1&tamanhoPagina=500'
    );
    expect(info?.numeroControlePncp).toBe('00394494000136-2-001220/2026');
  });

  it('segue para a página seguinte só enquanto não achou', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resposta({ data: [registro({ numeroContratoEmpenho: '00001' })], totalPaginas: 2 }))
      .mockResolvedValueOnce(resposta({ data: [registro()], totalPaginas: 2 }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchPncpContrato(contrato()))?.dataPublicacaoPncp).toBe('2026-07-07');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('pagina=2');
  });

  it('não acha: devolve null sem inventar e sem varrer além da última página', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resposta({ data: [registro({ numeroContratoEmpenho: '00001' })], totalPaginas: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchPncpContrato(contrato())).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('limita a 3 páginas', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resposta({ data: [], totalPaginas: 99 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchPncpContrato(contrato())).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('PNCP recusando (429) ou falhando devolve null, sem nova tentativa', async () => {
    const recusa = vi.fn().mockResolvedValue(resposta({}, false, 429));
    vi.stubGlobal('fetch', recusa);
    expect(await fetchPncpContrato(contrato())).toBeNull();
    expect(recusa).toHaveBeenCalledTimes(1);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede')));
    expect(await fetchPncpContrato(contrato())).toBeNull();
  });

  it('sem como buscar (UASG sem CNPJ), nem chama o PNCP', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchPncpContrato(contrato({ uasg: '110099' }))).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ataDeOrigem', () => {
  it('monta o número da ata no formato do sistema e guarda a UASG', () => {
    expect(ataDeOrigem({ numeroAtaRegistroPreco: '00059', anoAta: 2025, codigoUnidade: '200331' })).toEqual({ numeroAta: '00059/2025', uasg: '200331' });
    expect(ataDeOrigem({ numeroAtaRegistroPreco: '00059', anoAta: '2025' })).toEqual({ numeroAta: '00059/2025' });
  });

  it('sem número ou sem ano, não há ata de origem', () => {
    expect(ataDeOrigem({ anoAta: 2025 })).toBeNull();
    expect(ataDeOrigem({ numeroAtaRegistroPreco: '00059' })).toBeNull();
    expect(ataDeOrigem(null)).toBeNull();
    expect(ataDeOrigem(undefined)).toBeNull();
  });
});
