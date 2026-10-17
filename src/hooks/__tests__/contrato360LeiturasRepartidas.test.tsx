/**
 * Contrato 360 com uma leitura de faturas e uma de empenhos, repartidas entre as seções (passo 3 da auditoria das
 * telas, 6d):
 * - a fila de ações usa as faturas que a página já lê (['contrato-faturas']) em vez de uma segunda leitura de
 *   v_contrato_faturas; os avisos saem iguais;
 * - a aba Pagamentos usa as notas já lidas (['contract-empenhos']) em vez de reler contrato_empenhos, só quando essa
 *   leitura está no navegador, vale e tem menos de 5 min.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mocks } = vi.hoisted(() => ({
  mocks: { faturas: undefined as any, expectativas: undefined as any, empenhosPagamento: vi.fn() }
}));
vi.mock('../useFaturasDoContrato', async (orig) => ({
  ...(await orig<typeof import('../useFaturasDoContrato')>()),
  useFaturasDoContrato: () => mocks.faturas
}));
vi.mock('../useExpectativasPagamento', () => ({ useExpectativasPagamento: () => mocks.expectativas }));
vi.mock('../../components/financeiro/useContratosDoFinanceiro', () => ({ useContratosDoFinanceiro: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ role: 'admin' }) }));
vi.mock('../../services/cicloPagamentoApoioService', async (orig) => ({
  ...(await orig<typeof import('../../services/cicloPagamentoApoioService')>()),
  fetchEmpenhosDoContratoParaPagamento: mocks.empenhosPagamento
}));

import { useAvisosPagamentoDoContrato } from '../useAvisosPagamento';
import { calcularAvisosPagamento } from '../../services/avisosPagamentoService';
import { useEmpenhosDoContrato } from '../../components/contracts/payment/cicloPagamentoShared';

const CK = '200331-00015-2026';

function rodar<T>(hook: () => T, client = new QueryClient()): T {
  let r: T | undefined;
  const Sonda = () => {
    r = hook();
    return null;
  };
  renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <Sonda />
    </QueryClientProvider>
  );
  return r!;
}

const fatura = (over: Record<string, unknown>) => ({ idFatura: 1, emissao: '2026-08-05', referencia: '07/2026', cancelada: false, ...over });

describe('fila de ações do Contrato 360: avisos de nota com as faturas da página', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-25T12:00:00'));
    mocks.expectativas = {
      marcas: new Map([[CK, { contractKey: CK, tipo: 'MENSAL', valorMensal: 100, observacao: null, atualizadoPorNome: null, atualizadoEm: '2026-01-01' }]]),
      entregas: []
    };
  });
  afterEach(() => vi.useRealTimers());

  /** Os avisos como saíam da leitura antiga: só as faturas não canceladas, marcadas como não canceladas. */
  const comoAntes = (faturas: Array<ReturnType<typeof fatura>>) =>
    calcularAvisosPagamento({
      marcas: mocks.expectativas.marcas,
      entregas: [],
      faturas: faturas.filter((f) => !f.cancelada).map((f) => ({ contractKey: CK, emissao: f.emissao, referencia: f.referencia, cancelada: false })),
      ciclos: [],
      contratosVigentes: new Set([CK])
    });

  it('só uma fatura cancelada da competência: a nota continua "não chegou", igual a antes', () => {
    const faturas = [fatura({ referencia: '09/2026', emissao: '2026-10-02', cancelada: true }), fatura({})];
    mocks.faturas = { isSuccess: true, data: { faturas } };
    const avisos = rodar(() => useAvisosPagamentoDoContrato(CK, [], true));
    expect(avisos).toEqual(comoAntes(faturas));
    expect(avisos.map((a) => a.tipo)).toEqual(['NOTA_MENSAL_NAO_CHEGOU']);
  });

  it('fatura da competência: nenhum aviso, igual a antes', () => {
    const faturas = [fatura({ referencia: '09/2026', emissao: '2026-10-02' })];
    mocks.faturas = { isSuccess: true, data: { faturas } };
    expect(rodar(() => useAvisosPagamentoDoContrato(CK, [], true))).toEqual(comoAntes(faturas));
    expect(comoAntes(faturas)).toEqual([]);
  });

  it('enquanto as faturas não chegam, nenhum aviso (como antes)', () => {
    mocks.faturas = { isSuccess: false, data: undefined };
    expect(rodar(() => useAvisosPagamentoDoContrato(CK, [], true))).toEqual([]);
  });
});

describe('aba Pagamentos: notas do contrato já lidas pela página', () => {
  beforeEach(() => {
    mocks.empenhosPagamento.mockReset();
    mocks.empenhosPagamento.mockResolvedValue([]);
  });

  async function buscar(client: QueryClient) {
    rodar(() => useEmpenhosDoContrato(CK), client);
    await client.getQueryCache().find({ queryKey: ['ciclo-empenhos-contrato', CK] })!.fetch();
    return mocks.empenhosPagamento.mock.calls[0];
  }

  it('com a leitura da página fresca: usa as notas dela (sem reler contrato_empenhos)', async () => {
    const client = new QueryClient();
    client.setQueryData(['contract-empenhos', CK], [{ empenho_id: 'e1' }, { empenho_id: 'e2' }]);
    expect(await buscar(client)).toEqual([CK, { idsDoContrato: ['e1', 'e2'] }]);
  });

  it('sem a leitura da página (outras telas), ou com ela invalidada: lê contrato_empenhos como antes', async () => {
    expect(await buscar(new QueryClient())).toEqual([CK, { idsDoContrato: undefined }]);

    mocks.empenhosPagamento.mockClear();
    const client = new QueryClient();
    client.setQueryData(['contract-empenhos', CK], [{ empenho_id: 'e1' }]);
    await client.invalidateQueries({ queryKey: ['contract-empenhos', CK], refetchType: 'none' });
    expect(await buscar(client)).toEqual([CK, { idsDoContrato: undefined }]);
  });

  it('com a leitura da página de mais de 5 min: lê contrato_empenhos', async () => {
    const client = new QueryClient();
    client.setQueryData(['contract-empenhos', CK], [{ empenho_id: 'e1' }], { updatedAt: Date.now() - 6 * 60 * 1000 });
    expect(await buscar(client)).toEqual([CK, { idsDoContrato: undefined }]);
  });
});
