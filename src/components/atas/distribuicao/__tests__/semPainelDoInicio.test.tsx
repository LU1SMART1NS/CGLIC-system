/**
 * Passo 3 da auditoria das telas (6a): quem não mostra pendências deixa de ler o painel do Início.
 * - A fila de Vínculos, os números do menu e a gaveta do Início usam a carteira leve; a Central de Distribuição
 *   continua com o painel.
 * - O Financeiro usa a carteira leve.
 * - Sem as pendências, os números que essas telas mostram (gestor diferente da ata, carga e ocupação de cada gestor)
 *   não mudam: só os contadores de pendência dependem do painel.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../../../context/AuthContext', () => ({ useAuth: vi.fn(() => ({ role: 'admin' })) }));
vi.mock('../../../../hooks/useAtasPortfolio', async (orig) => ({
  ...(await orig<typeof import('../../../../hooks/useAtasPortfolio')>()),
  useAtasPortfolio: vi.fn(() => ({ arps: [], scopedArps: [], itemsByAta: {}, gestorByAta: {}, isLoading: false, scopeLoading: false, reload: vi.fn(), leiturasDasAtas: [] }))
}));
vi.mock('../../../../hooks/useContractsPortfolio', () => ({
  useContractsPortfolio: vi.fn(() => ({ rows: [], contractsByKey: new Map(), attentionItems: [], isLoading: false, isLoadingScope: false, leiturasDosContratos: [], refresh: vi.fn() }))
}));
const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false, error: null, refetch: vi.fn() });
vi.mock('../../../../hooks/useAtaManagers', () => ({ useArpItemContractLinks: vi.fn(() => ok([])) }));
vi.mock('../../../../hooks/useContratosSemAta', () => ({ useContratosSemAta: vi.fn(() => ok({})) }));
vi.mock('../../../../hooks/useDescartesAtaContrato', () => ({ useDescartesAtaContrato: vi.fn(() => ok({})) }));
vi.mock('../../../../hooks/useVinculoAutomatico', () => ({ useMotivosVinculoManual: vi.fn(() => ({ data: new Map(), isError: false, refetch: vi.fn() })) }));
vi.mock('../../../../hooks/useItensDoContrato', () => ({ useNumerosDosItensDosContratos: vi.fn(() => ({ data: undefined })) }));

import { useContractsPortfolio } from '../../../../hooks/useContractsPortfolio';
import { usePendenciasVinculoAta } from '../usePendenciasVinculoAta';
import { useContratosDoFinanceiro } from '../../../financeiro/useContratosDoFinanceiro';
import { buildDistribuicaoEquipe } from '../distribuicaoEquipe';
import type { DashboardAttentionItem } from '../../../../types/managementDashboard';

function rodar(hook: () => unknown) {
  const Sonda = () => {
    hook();
    return null;
  };
  renderToStaticMarkup(<Sonda />);
}

describe('telas sem o painel do Início', () => {
  beforeEach(() => vi.mocked(useContractsPortfolio).mockClear());

  it('a fila de Vínculos, o menu e a gaveta (padrão) usam a carteira leve', () => {
    rodar(() => usePendenciasVinculoAta());
    expect(useContractsPortfolio).toHaveBeenCalledWith({ pendencias: false });
  });

  it('a Central de Distribuição e o "Atribuir gestor" aberto pedem as pendências', () => {
    rodar(() => usePendenciasVinculoAta({ pendencias: true }));
    expect(useContractsPortfolio).toHaveBeenCalledWith({ pendencias: true });
  });

  it('o Financeiro usa a carteira leve', () => {
    rodar(() => useContratosDoFinanceiro());
    expect(useContractsPortfolio).toHaveBeenCalledWith({ pendencias: false });
  });
});

describe('carga dos gestores sem as pendências', () => {
  const atas = [
    { numeroAta: '00010/2024', faixa: 'REGULAR' as const, valor: 100, gestorNome: 'Ana', itens: 12 },
    { numeroAta: '00011/2024', faixa: 'CRITICO' as const, valor: 50, gestorNome: 'Bia', itens: 2 }
  ];
  const contratos = [
    { contractKey: '200331-00002-2025', numero: '00002/2025', faixa: 'REGULAR' as const, valor: 10, gestorNome: 'Bia', categoria: 'Serviços', mesesVigencia: 30 },
    { contractKey: '200331-00003-2025', numero: '00003/2025', faixa: 'ATENCAO' as const, valor: 20, gestorNome: 'Ana', mesesVigencia: 6 }
  ];
  const links = [
    { ataKey: '00010/2024', contractKey: '200331-00002-2025' },
    { ataKey: '00011/2024', contractKey: '200331-00003-2025' }
  ];
  const alertas: DashboardAttentionItem[] = [
    { id: '1', category: 'TAREFA_ATRASADA', severity: 'URGENTE', title: 'x', contractKey: '200331-00002-2025' },
    { id: '2', category: 'SALDO_BAIXO' as DashboardAttentionItem['category'], severity: 'ATENCAO' as DashboardAttentionItem['severity'], title: 'y', numeroAta: '00010/2024' }
  ];
  const capacidadeDoGestor = (nome: string) => (nome === 'Ana' ? 0.6 : 1);

  it('gestor diferente da ata, carga, ocupação e média saem iguais; só os contadores de pendência mudam', () => {
    const com = buildDistribuicaoEquipe({ atas, contratos, links, attentionItems: alertas, capacidadeDoGestor });
    const sem = buildDistribuicaoEquipe({ atas, contratos, links, attentionItems: [], capacidadeDoGestor });
    expect(sem.divergencias).toEqual(com.divergencias);
    expect(sem.divergencias).toHaveLength(2);
    expect(sem.totais).toEqual(com.totais);
    const carga = (d: typeof com) => d.linhas.map((l) => [l.gestorNome, l.equivalente, l.capacidade, l.ocupacao, l.relacaoEquipe, l.complexidade]);
    expect(carga(sem)).toEqual(carga(com));
    // Sanidade: o painel muda mesmo os contadores de pendência (que só a Central e o "Atribuir gestor" mostram).
    expect(com.linhas.some((l) => l.pendencias.urgentes > 0)).toBe(true);
    expect(sem.linhas.every((l) => l.pendencias.urgentes === 0 && l.pendencias.acompanhar === 0)).toBe(true);
  });
});
