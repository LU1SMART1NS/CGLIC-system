import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SincronizacaoEmpenhosContrato } from '../../../services/contratoEmpenhosSincronizacaoService';

vi.mock('../../../hooks/useDetailOrigin', () => ({ useNavigateWithOrigin: () => vi.fn() }));
vi.mock('../../../hooks/useContractEmpenhoItemLinks', () => ({ useContractEmpenhoItemLinks: () => ({ data: [] }) }));
vi.mock('../../../hooks/useContractFinancialSummary', () => ({ useContractFinancialSummary: vi.fn() }));
vi.mock('../../../hooks/useSincronizacaoEmpenhosContrato', () => ({ useSincronizacaoEmpenhosContrato: vi.fn() }));

import { useContractFinancialSummary } from '../../../hooks/useContractFinancialSummary';
import { useSincronizacaoEmpenhosContrato } from '../../../hooks/useSincronizacaoEmpenhosContrato';
import { ContractFinancialExecutionSection } from '../ContractFinancialExecutionSection';

const contract = { id: '200331-00021-2017', uasg: '200331', numero: '00021/2017', ano: '2017' } as any;

const sync = (over: Partial<SincronizacaoEmpenhosContrato>): SincronizacaoEmpenhosContrato => ({
  contractKey: contract.id,
  situacao: 'OK',
  mensagem: null,
  empenhosLidos: 1,
  empenhosGravados: 1,
  vinculosGravados: 1,
  tentativaEm: '2026-10-06T17:00:00Z',
  ultimoSucessoEm: '2026-10-06T17:00:00Z',
  ...over
});

const vazio = { empenhosList: [], summary: null, isLoading: false, isError: false, refetch: vi.fn() };
const comEmpenho = {
  empenhosList: [
    { empenho_id: 'e1', canonical_key: '200331-2022-2022NE245', numero_oficial: '2022NE000245', credor_nome: 'SERPRO', data_emissao: '2022-03-01', valor_empenhado: 1000, valor_liquidado: 500, valor_pago: 400 }
  ],
  summary: {
    totalValorEmpenhadoGlobal: 1000,
    totalValorLiquidadoGlobal: 500,
    totalValorPagoGlobal: 400,
    saldoNaoExecutadoGlobal: 600,
    saldoALiquidarGlobal: 500,
    saldoAPagarGlobal: 100
  },
  isLoading: false,
  isError: false,
  refetch: vi.fn()
};

const render = () => renderToStaticMarkup(<ContractFinancialExecutionSection contract={contract} contractKey={contract.id} />);

describe('ContractFinancialExecutionSection: situação da sincronização', () => {
  beforeEach(() => vi.clearAllMocks());

  it('nunca sincronizado: mantém a orientação de usar Atualizar empenhos', () => {
    vi.mocked(useContractFinancialSummary).mockReturnValue(vazio as any);
    vi.mocked(useSincronizacaoEmpenhosContrato).mockReturnValue({ data: null } as any);
    const html = render();
    expect(html).toContain('Nenhum empenho vinculado a este contrato');
    expect(html).not.toContain('contract-financial-sync-failed');
  });

  it('fonte respondeu sem empenho: diz isso e quando consultou', () => {
    vi.mocked(useContractFinancialSummary).mockReturnValue(vazio as any);
    vi.mocked(useSincronizacaoEmpenhosContrato).mockReturnValue({ data: sync({ situacao: 'SEM_EMPENHOS', empenhosLidos: 0 }) } as any);
    const html = render();
    expect(html).toContain('O Contratos.gov.br não tem empenho para este contrato');
    expect(html).toContain('Consulta feita em 06/10/2026');
  });

  it('consulta falhou e nunca deu certo: não afirma ausência de empenho', () => {
    vi.mocked(useContractFinancialSummary).mockReturnValue(vazio as any);
    vi.mocked(useSincronizacaoEmpenhosContrato).mockReturnValue({
      data: sync({ situacao: 'ERRO', mensagem: 'Contratos.gov.br não respondeu em 30 s.', ultimoSucessoEm: null })
    } as any);
    const html = render();
    expect(html).toContain('Os empenhos deste contrato não puderam ser consultados');
    expect(html).toContain('Contratos.gov.br não respondeu em 30 s.');
    expect(html).toContain('Isto não indica ausência de empenhos');
  });

  it('última tentativa falhou mas há dados antigos: aviso com as duas datas, acima da tabela', () => {
    vi.mocked(useContractFinancialSummary).mockReturnValue(comEmpenho as any);
    vi.mocked(useSincronizacaoEmpenhosContrato).mockReturnValue({
      data: sync({ situacao: 'ERRO', mensagem: 'Contratos.gov.br respondeu 503.', tentativaEm: '2026-10-07T12:00:00Z', ultimoSucessoEm: '2026-10-06T17:00:00Z' })
    } as any);
    const html = render();
    expect(html).toContain('contract-financial-sync-failed');
    expect(html).toContain('falhou: Contratos.gov.br respondeu 503.');
    expect(html).toContain('Os dados abaixo são da consulta de 06/10/2026');
    expect(html).toContain('2022NE000245');
  });

  it('consulta em dia: mostra só a data, discreta', () => {
    vi.mocked(useContractFinancialSummary).mockReturnValue(comEmpenho as any);
    vi.mocked(useSincronizacaoEmpenhosContrato).mockReturnValue({ data: sync({}) } as any);
    const html = render();
    expect(html).toContain('contract-financial-sync-ok');
    expect(html).toContain('Empenhos consultados no Contratos.gov.br em 06/10/2026');
    expect(html).not.toContain('contract-financial-sync-failed');
  });
});
