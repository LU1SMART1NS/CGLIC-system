/**
 * Avisos de pagamento do Início com a leitura leve das faturas (estudo docs/estudos/inicio-fila-do-banco.md, corte 2):
 * só contract_key, emissao, referencia e cancelada da tabela contrato_faturas, e só dos contratos marcados. Os avisos
 * têm de sair iguais aos calculados com todas as faturas da view.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

interface LinhaFatura {
  id_fatura: number;
  contract_key: string;
  emissao: string | null;
  referencia: string | null;
  cancelada: boolean;
}

const banco = vi.hoisted(() => ({
  faturas: [] as LinhaFatura[],
  pedidos: [] as Array<{ tabela: string; colunas: string; contratos: string[]; ordem: string; de: number; ate: number }>,
  erro: null as { message: string } | null,
  leves: [] as unknown[]
}));

vi.mock('../../services/supabaseClient', () => {
  const consulta = (tabela: string) => {
    const pedido = { tabela, colunas: '', contratos: [] as string[], ordem: '', de: 0, ate: 0 };
    const q: any = {
      select: (c: string) => ((pedido.colunas = c), q),
      in: (_col: string, v: string[]) => ((pedido.contratos = v), q),
      order: (c: string) => ((pedido.ordem = c), q),
      range: (de: number, ate: number) => ((pedido.de = de), (pedido.ate = ate), q),
      then: (ok: (r: unknown) => void) => {
        banco.pedidos.push(pedido);
        if (banco.erro) return ok({ data: null, error: banco.erro });
        const linhas = banco.faturas
          .filter((f) => pedido.contratos.includes(f.contract_key))
          .sort((a, b) => a.id_fatura - b.id_fatura)
          .slice(pedido.de, pedido.ate + 1)
          .map(({ contract_key, emissao, referencia, cancelada }) => ({ contract_key, emissao, referencia, cancelada }));
        return ok({ data: linhas, error: null });
      }
    };
    return q;
  };
  return { isSupabaseConfigured: true, supabase: { from: consulta } };
});

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: vi.fn((opts: { queryKey: readonly unknown[] }) => {
    if (opts.queryKey[0] === 'financeiro-faturas') return { data: banco.leves, isLoading: false, isSuccess: true };
    if (opts.queryKey[0] === 'previsao-envio') return { data: true, isLoading: false, isSuccess: true };
    return { data: [], isLoading: false, isSuccess: true };
  })
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn(() => ({ role: 'admin' })) }));
vi.mock('../useExpectativasPagamento', () => ({ useExpectativasPagamento: vi.fn() }));
vi.mock('../../components/financeiro/useContratosDoFinanceiro', () => ({ useContratosDoFinanceiro: vi.fn() }));

import { useQuery } from '@tanstack/react-query';
import { useExpectativasPagamento } from '../useExpectativasPagamento';
import { useContratosDoFinanceiro } from '../../components/financeiro/useContratosDoFinanceiro';
import { faturasDosAvisosKey, useAvisosPagamentoGerais } from '../useAvisosPagamento';
import { fetchFaturasParaAvisos } from '../../services/financeiroCarteiraService';
import { calcularAvisosPagamento } from '../../services/avisosPagamentoService';
import type { EntregaPrevista, ExpectativaPagamento } from '../../services/expectativaPagamentoService';

// Contratos: A mensal com nota de setembro; B mensal só com nota cancelada; C mensal sem nota; D sem marca (com
// faturas); E e F com entrega prevista vencida, E com nota depois da entrega e F sem nota.
const CONTRATOS = ['200331-00001-2025', '200331-00002-2025', '200331-00003-2025', '200331-00004-2025', '200330-00005-2025', '200330-00006-2025'];
const [A, B, C, D, E, F] = CONTRATOS;

const marca = (contractKey: string): ExpectativaPagamento => ({
  contractKey,
  tipo: 'MENSAL',
  valorMensal: 1000,
  observacao: null,
  atualizadoPorNome: null,
  atualizadoEm: '2026-09-01T00:00:00Z'
});
const entrega = (id: string, contractKey: string): EntregaPrevista => ({
  id,
  contractKey,
  dataPrevista: '2026-09-01',
  valor: 500,
  empenhoCanonicalKey: null,
  descricao: 'Entrega',
  situacao: 'PREVISTA',
  motivoCancelamento: null,
  criadoPorNome: null
});
const fatura = (id: number, contract_key: string, o: Partial<LinhaFatura> = {}): LinhaFatura => ({
  id_fatura: id,
  contract_key,
  emissao: '2026-08-05',
  referencia: '07/2026',
  cancelada: false,
  ...o
});

const marcas = new Map([A, B, C].map((k) => [k, marca(k)]));
const entregas = [entrega('e1', E), entrega('e2', F)];

function rodarHook() {
  const saida: Array<ReturnType<typeof useAvisosPagamentoGerais>> = [];
  const Sonda = () => {
    saida.push(useAvisosPagamentoGerais());
    return null;
  };
  renderToStaticMarkup(<Sonda />);
  return saida[0];
}

describe('avisos de pagamento com a leitura leve das faturas', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T12:00:00'));
    vi.mocked(useQuery).mockClear();
    banco.pedidos = [];
    banco.erro = null;
    banco.faturas = [
      fatura(1, A, { referencia: '09/2026', emissao: '2026-09-28' }),
      fatura(2, A),
      fatura(3, B, { referencia: '09/2026', emissao: '2026-10-02', cancelada: true }),
      fatura(4, D, { referencia: '09/2026', emissao: '2026-10-03' }),
      fatura(5, E, { referencia: null, emissao: '2026-09-04' }),
      fatura(6, F, { referencia: '08/2026', emissao: '2026-07-01' })
    ];
    vi.mocked(useExpectativasPagamento).mockReturnValue({ marcas, entregas, isLoading: false } as any);
    vi.mocked(useContratosDoFinanceiro).mockReturnValue({
      contrato: (k: string) => ({ numero: k }),
      lista: CONTRATOS.map((contractKey) => ({ contractKey, numero: contractKey, expirado: false })),
      escopo: null,
      isLoading: false
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lê da tabela só as 4 colunas e só dos contratos marcados, em ordem fixa', async () => {
    const leves = await fetchFaturasParaAvisos([F, A, E, B, C, A]);
    expect(banco.pedidos).toEqual([
      { tabela: 'contrato_faturas', colunas: 'contract_key, emissao, referencia, cancelada', contratos: [A, B, C, E, F].sort(), ordem: 'id_fatura', de: 0, ate: 999 }
    ]);
    expect(leves.map((f) => f.contractKey)).not.toContain(D);
    expect(leves).toContainEqual({ contractKey: B, emissao: '2026-10-02', referencia: '09/2026', cancelada: true });
  });

  it('os avisos são os mesmos calculados com todas as faturas da view', async () => {
    banco.leves = await fetchFaturasParaAvisos([...marcas.keys(), ...entregas.map((e) => e.contractKey)]);
    const { avisos } = rodarHook();

    const todasDaView = banco.faturas.map((f) => ({ contractKey: f.contract_key, emissao: f.emissao, referencia: f.referencia, cancelada: f.cancelada }));
    const esperado = calcularAvisosPagamento({
      previsao: undefined,
      marcas,
      entregas,
      faturas: todasDaView,
      ciclos: [],
      contratosVigentes: new Set(CONTRATOS),
      numeroDoContrato: (k) => k
    });
    // Sem a previsão (o coordenador já a enviou neste teste), os avisos de nota e de entrega.
    expect(avisos).toEqual(esperado);
    expect(avisos.map((a) => `${a.tipo}:${a.contractKey}`).sort()).toEqual(
      [`ENTREGA_SEM_NOTA:${F}`, `NOTA_MENSAL_NAO_CHEGOU:${B}`, `NOTA_MENSAL_NAO_CHEGOU:${C}`].sort()
    );
  });

  it('a consulta fica sob o prefixo das faturas do Financeiro (quem relê as faturas relê estas)', () => {
    banco.leves = [];
    rodarHook();
    const chaves = vi.mocked(useQuery).mock.calls.map(([o]) => o.queryKey);
    expect(chaves).toContainEqual(faturasDosAvisosKey([A, B, C, E, F].sort()));
    expect(faturasDosAvisosKey([A])[0]).toBe('financeiro-faturas');
    // A lista pesada (view com 21 colunas e conferência do Tesouro) não é pedida pelos avisos.
    expect(chaves).not.toContainEqual(['financeiro-faturas']);
  });

  it('muitos contratos: em lotes de 100, cada lote paginado; falha vira erro, não lista parcial', async () => {
    const muitos = Array.from({ length: 150 }, (_, i) => `200331-${String(i).padStart(5, '0')}-2025`);
    await fetchFaturasParaAvisos(muitos);
    expect(banco.pedidos.map((p) => p.contratos.length)).toEqual([100, 50]);

    banco.erro = { message: 'canceling statement due to statement timeout' };
    await expect(fetchFaturasParaAvisos([A])).rejects.toThrow();
  });

  it('sem contrato marcado não lê nada', async () => {
    expect(await fetchFaturasParaAvisos([])).toEqual([]);
    expect(banco.pedidos).toEqual([]);
  });
});
