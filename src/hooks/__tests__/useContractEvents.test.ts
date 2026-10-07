import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContractDashboardRecord } from '../../types';

const fetchHistorico = vi.fn();
const lerCopia = vi.fn();
vi.mock('../../services/api', () => ({
  fetchContratosGovHistorico: (...args: unknown[]) => fetchHistorico(...args),
  fetchContratosGovResponsaveis: vi.fn(),
  fetchContratosGovGarantias: vi.fn()
}));
vi.mock('../../services/contratoDetalhesCopiaService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/contratoDetalhesCopiaService')>()),
  lerCopiaDetalheContrato: (...args: unknown[]) => lerCopia(...args)
}));

import { getContractEventsQueryOptions } from '../useContractEvents';

const contrato = (over: Partial<ContractDashboardRecord> = {}) =>
  ({
    id: '110099-00009-2024',
    numero: '00009',
    ano: 2024,
    numeroFormatado: '00009/2024',
    uasg: '110099',
    contratoId: 299693,
    valorInicial: 1321492.8,
    dataAssinatura: '2024-08-13',
    dataVigenciaInicio: '2024-08-22',
    dataVigenciaFim: '2029-08-22',
    statusVigencia: 'Vigente',
    fonteDados: 'Contratos.gov.br',
    ...over
  }) as ContractDashboardRecord;

const HISTORICO = [
  { id: 1, tipo: 'Contrato', numero: '00009/2024', data_assinatura: '2024-08-13', vigencia_fim: '2029-08-22', valor_global: '1.321.492,80', criado_em: '2024-08-14' },
  { id: 2, tipo: 'Termo Aditivo', numero: '00001/2026', qualificacao_termo: [{ descricao: 'VIGÊNCIA' }], data_assinatura: '2026-04-28', vigencia_fim: '2030-08-22', valor_global: '1.321.492,80', novo_valor_global: '0,00', criado_em: '2026-04-30' }
];

const run = (c: ContractDashboardRecord) => getContractEventsQueryOptions(c).queryFn();

describe('getContractEventsQueryOptions: histórico do Contratos.gov.br', () => {
  beforeEach(() => {
    fetchHistorico.mockReset();
    lerCopia.mockReset();
  });

  it('junta a celebração aos termos do histórico', async () => {
    fetchHistorico.mockResolvedValue(HISTORICO);
    const r = await run(contrato());
    expect(fetchHistorico).toHaveBeenCalledWith(299693, { falharSeErro: true });
    expect(r.eventos.map((e) => e.tipoEvento)).toEqual(['CELEBRACAO', 'PRORROGACAO']);
    expect(r.historico).toEqual({ origem: 'API', copiadoEm: null });
    expect(lerCopia).not.toHaveBeenCalled();
  });

  it('API respondeu vazio: só a celebração, sem aviso', async () => {
    fetchHistorico.mockResolvedValue([]);
    const r = await run(contrato());
    expect(r.eventos.map((e) => e.tipoEvento)).toEqual(['CELEBRACAO']);
    expect(r.historico.origem).toBe('API');
  });

  it('API falhou: usa a cópia guardada, com a data', async () => {
    fetchHistorico.mockRejectedValue(new Error('503'));
    lerCopia.mockResolvedValue({ dados: HISTORICO, copiadoEm: '2026-10-05T17:32:00Z' });
    const r = await run(contrato());
    expect(lerCopia).toHaveBeenCalledWith('110099-00009-2024', 'historico');
    expect(r.eventos.map((e) => e.tipoEvento)).toEqual(['CELEBRACAO', 'PRORROGACAO']);
    expect(r.historico).toEqual({ origem: 'COPIA', copiadoEm: '2026-10-05T17:32:00Z' });
  });

  it('API falhou e sem cópia: só a celebração, marcado como falha', async () => {
    fetchHistorico.mockRejectedValue(new Error('503'));
    lerCopia.mockResolvedValue(null);
    const r = await run(contrato());
    expect(r.eventos.map((e) => e.tipoEvento)).toEqual(['CELEBRACAO']);
    expect(r.historico.origem).toBe('FALHA');
  });

  it('não consulta contratos de outra fonte nem sem id', async () => {
    expect((await run(contrato({ fonteDados: 'Compras.gov.br' }))).historico.origem).toBe('NAO_CONSULTADO');
    await run(contrato({ contratoId: undefined }));
    expect(fetchHistorico).not.toHaveBeenCalled();
  });

  it('não duplica quando o contrato já traz aditivos em raw', async () => {
    const r = await run(contrato({ raw: { termos_aditivos: [{ sequencial: 1, tipo: 'Termo Aditivo' }] } }));
    expect(fetchHistorico).not.toHaveBeenCalled();
    expect(r.eventos).toHaveLength(2);
  });
});
