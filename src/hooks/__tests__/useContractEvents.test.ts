import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContractDashboardRecord } from '../../types';

const fetchHistorico = vi.fn();
vi.mock('../../services/api', () => ({ fetchContratosGovHistorico: (...args: unknown[]) => fetchHistorico(...args) }));

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
  beforeEach(() => fetchHistorico.mockReset());

  it('junta a celebração aos termos do histórico', async () => {
    fetchHistorico.mockResolvedValue(HISTORICO);
    const events = await run(contrato());
    expect(fetchHistorico).toHaveBeenCalledWith(299693);
    expect(events.map((e) => e.tipoEvento)).toEqual(['CELEBRACAO', 'PRORROGACAO']);
  });

  it('se a API falha (lista vazia), mostra só a celebração', async () => {
    fetchHistorico.mockResolvedValue([]);
    expect((await run(contrato())).map((e) => e.tipoEvento)).toEqual(['CELEBRACAO']);
  });

  it('não consulta contratos de outra fonte nem sem id', async () => {
    await run(contrato({ fonteDados: 'Compras.gov.br' }));
    await run(contrato({ contratoId: undefined }));
    expect(fetchHistorico).not.toHaveBeenCalled();
  });

  it('não duplica quando o contrato já traz aditivos em raw', async () => {
    const events = await run(contrato({ raw: { termos_aditivos: [{ sequencial: 1, tipo: 'Termo Aditivo' }] } }));
    expect(fetchHistorico).not.toHaveBeenCalled();
    expect(events).toHaveLength(2);
  });
});
