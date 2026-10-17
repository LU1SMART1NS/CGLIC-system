import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

/**
 * Vínculos → Contratos à ata quando uma leitura falha (passo 2 da auditoria das telas). Duas partes:
 * - o hook da fila (usePendenciasVinculoAta) diz quando ela não pode ser montada: sem os vínculos, todo contrato
 *   pareceria sem ata; sem as marcas "não pertence", eles voltariam à fila;
 * - a página mostra a faixa e, nesse caso, "não carregou" no lugar da fila ou de "todos têm ata".
 */
vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn(() => ({ role: 'admin' })) }));
vi.mock('../../../hooks/useAtasPortfolio', async (orig) => ({ ...(await orig<typeof import('../../../hooks/useAtasPortfolio')>()), useAtasPortfolio: vi.fn() }));
vi.mock('../../../hooks/useContractsPortfolio', () => ({ useContractsPortfolio: vi.fn() }));
vi.mock('../../../hooks/useAtaManagers', () => ({ useArpItemContractLinks: vi.fn() }));
vi.mock('../../../hooks/useContratosSemAta', () => ({ useContratosSemAta: vi.fn() }));
vi.mock('../../../hooks/useDescartesAtaContrato', () => ({ useDescartesAtaContrato: vi.fn() }));
vi.mock('../../../hooks/useVinculoAutomatico', () => ({ useMotivosVinculoManual: vi.fn(() => ({ data: new Map(), isError: false, refetch: vi.fn() })) }));
vi.mock('../../../hooks/useItensDoContrato', () => ({ useNumerosDosItensDosContratos: vi.fn(() => ({ data: undefined })) }));
vi.mock('../../../hooks/useComplexidadeAjustes', () => ({ useComplexidadeAjustes: vi.fn(() => ({ data: {}, isError: false, refetch: vi.fn() })) }));
// A fila e as janelas têm testes próprios: aqui só importa se a página as mostra.
vi.mock('../../atas/distribuicao/ContratosSemVinculoFila', () => ({ ContratosSemVinculoFila: () => <div data-testid="fila-contratos-sem-ata" /> }));
vi.mock('../../atas/distribuicao/VinculoAutomaticoFaixa', () => ({ VinculoAutomaticoSimular: () => null }));
vi.mock('../../atas/distribuicao/AtribuirGestorModal', () => ({ AtribuirGestorModal: () => null }));

import { useAtasPortfolio } from '../../../hooks/useAtasPortfolio';
import { useContractsPortfolio } from '../../../hooks/useContractsPortfolio';
import { useArpItemContractLinks } from '../../../hooks/useAtaManagers';
import { useContratosSemAta } from '../../../hooks/useContratosSemAta';
import { useDescartesAtaContrato } from '../../../hooks/useDescartesAtaContrato';
import { ContratosAtaPage } from '../ContratosAtaPage';

const render = () => renderToStaticMarkup(<MemoryRouter><ContratosAtaPage /></MemoryRouter>);
const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false, error: null, refetch: vi.fn() });
const falhou = () => ({ data: undefined, isLoading: false, isError: true, error: new Error('canceling statement due to statement timeout'), refetch: vi.fn() });

// Um contrato vigente sem vínculo de ata: entra na fila.
const contrato = { numero: '00001', ano: 2026, objeto: 'X', fornecedorNome: 'F', fornecedorCnpjCpf: '1', idCompra: 'C1', uasg: '200331' };

describe('Vínculos → Contratos à ata: uma leitura falha, a faixa avisa', () => {
  beforeEach(() => {
    vi.mocked(useAtasPortfolio).mockReturnValue({
      arps: [],
      scopedArps: [],
      itemsByAta: {},
      gestorByAta: {},
      isLoading: false,
      scopeLoading: false,
      reload: vi.fn(),
      leiturasDasAtas: [{ rotulo: 'atas da UASG 200331', query: ok({}) }]
    } as any);
    vi.mocked(useContractsPortfolio).mockReturnValue({
      rows: [{ contractKey: '200331-00001-2026', contract: contrato, faixa: 'VIGENTE', diasRestantes: 200, gestorNome: undefined, pendencias: [], atas: [] }],
      contractsByKey: new Map(),
      attentionItems: [],
      hasAnyData: true,
      isLoading: false,
      isLoadingScope: false,
      isFetching: false,
      isPartial: false,
      podeForcarAtualizacao: true,
      refresh: vi.fn(),
      leiturasDosContratos: [{ rotulo: 'contratos da UASG 200331', query: ok([]) }]
    } as any);
    vi.mocked(useArpItemContractLinks).mockReturnValue(ok([]) as any);
    vi.mocked(useContratosSemAta).mockReturnValue(ok({}) as any);
    vi.mocked(useDescartesAtaContrato).mockReturnValue(ok({}) as any);
  });

  it('a fila não lê o painel do Início: as pendências só são pedidas quando o "Atribuir gestor" abre', () => {
    vi.mocked(useContractsPortfolio).mockClear();
    render();
    expect(useContractsPortfolio).toHaveBeenCalledWith({ pendencias: false });
    expect(useContractsPortfolio).not.toHaveBeenCalledWith({ pendencias: true });
  });

  it('tudo carregou: a fila aparece, sem faixa', () => {
    const html = render();
    expect(html).toContain('data-testid="fila-contratos-sem-ata"');
    expect(html).not.toContain('fontes-com-falha');
  });

  it('os vínculos com as atas não carregaram: a fila espera ("não carregou"), em vez de mostrar todo contrato sem ata', () => {
    vi.mocked(useArpItemContractLinks).mockReturnValue(falhou() as any);
    const html = render();
    expect(html).toContain('data-testid="vinculacao-contratos-fontes-com-falha"');
    expect(html).toContain('<strong>Vínculos entre itens de ata e contratos</strong>');
    expect(html).toContain('data-testid="vinculacao-contratos-nao-carregou"');
    expect(html).not.toContain('data-testid="fila-contratos-sem-ata"');
  });

  it('as marcas "não pertence a ata" não carregaram: a fila também espera', () => {
    vi.mocked(useContratosSemAta).mockReturnValue(falhou() as any);
    const html = render();
    expect(html).toContain('<strong>Contratos marcados &quot;não pertence a ata&quot;</strong>');
    expect(html).not.toContain('data-testid="fila-contratos-sem-ata"');
  });

  it('as atas descartadas não carregaram: a faixa avisa e a fila fica (o descarte só muda a sugestão)', () => {
    vi.mocked(useDescartesAtaContrato).mockReturnValue(falhou() as any);
    const html = render();
    expect(html).toContain('<strong>Atas descartadas</strong>');
    expect(html).toContain('data-testid="fila-contratos-sem-ata"');
  });

  it('os contratos não carregaram: "não carregaram", e não "todos os contratos têm ata"', () => {
    vi.mocked(useContractsPortfolio).mockReturnValue({
      ...vi.mocked(useContractsPortfolio)(),
      rows: [],
      hasAnyData: false,
      leiturasDosContratos: [{ rotulo: 'contratos da UASG 200331', query: falhou() }]
    } as any);
    const html = render();
    expect(html).toContain('<strong>Contratos da UASG 200331</strong>');
    expect(html).toContain('data-testid="vinculacao-contratos-nao-carregou"');
    expect(html).not.toContain('Todos os contratos da sua carteira têm ata vinculada');
    expect(html).not.toContain('Erro ao carregar os contratos');
  });
});
