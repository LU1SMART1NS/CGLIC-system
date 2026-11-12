import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { contarItensAAlocar, definirContagemExtra, useContagensExtras, zerarContagensExtras } from '../contagemExtras';

vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn(() => ({ role: 'admin' })) }));
vi.mock('../useContagemVinculacao', () => ({ useContagemVinculacao: vi.fn(() => ({ aosItens: 3, aoContrato: 2 })) }));
vi.mock('../../financeiro/useContagemFinanceiro', () => ({ useContagemFinanceiro: vi.fn(() => null) }));
vi.mock('../../admin/useContagemGruposUasgs', () => ({ useContagemGruposUasgs: vi.fn(() => null) }));
vi.mock('../../emendas/useContagemEmendas', () => ({ useContagemEmendas: vi.fn(() => null) }));
vi.mock('../../emendas/useContagemGruposBeneficiarios', () => ({ useContagemGruposBeneficiarios: vi.fn(() => null) }));
vi.mock('../../emendas/useContagemEmendasAContratar', () => ({ useContagemEmendasAContratar: vi.fn(() => null) }));
vi.mock('../../atas/montar/useContagemAtasAMontar', () => ({ useContagemAtasAMontar: vi.fn(() => null) }));
// O espião do cache e os cálculos pesados não rodam no render estático: o que interessa aqui é o número no ícone.
vi.mock('../ContagensDaCarteira', () => ({ ContagensDaCarteira: () => null }));

import { useAuth } from '../../../context/AuthContext';
import { useContagemVinculacao } from '../useContagemVinculacao';
import { useContagemFinanceiro } from '../../financeiro/useContagemFinanceiro';
import { useContagemGruposUasgs } from '../../admin/useContagemGruposUasgs';
import { useContagemEmendas } from '../../emendas/useContagemEmendas';
import { Sidebar } from '../../layout/Sidebar';

const linha = (o: any) => ({ quantitativoSenasp: 100, faixa: 'REGULAR', nivelAlocacao: 'SEM', ...o });

describe('contarItensAAlocar', () => {
  it('conta sem alocação e parcial de atas vigentes; ignora alocados, encerradas e sem quantitativo', () => {
    expect(
      contarItensAAlocar([
        linha({ nivelAlocacao: 'SEM' }),
        linha({ nivelAlocacao: 'PARCIAL' }),
        linha({ nivelAlocacao: 'TOTAL' }),
        linha({ nivelAlocacao: 'SEM', faixa: 'EXPIRADO' }),
        linha({ nivelAlocacao: 'SEM', quantitativoSenasp: 0 })
      ] as any)
    ).toBe(2);
  });
});

// Alocação, Vínculos e Financeiro são subitens de Atas e Contratos: só aparecem dentro da área (por isso o padrão '/atas').
const menu = (rota = '/atas', mode: 'rail' | 'bottom' = 'rail') =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[rota]}>
      <Sidebar mode={mode} />
    </MemoryRouter>
  );

describe('número no ícone das áreas', () => {
  beforeEach(() => {
    zerarContagensExtras();
    vi.mocked(useAuth).mockReturnValue({ role: 'admin' } as any);
    vi.mocked(useContagemVinculacao).mockReturnValue({ aosItens: 3, aoContrato: 2, notasForaDoContrato: 0 });
    vi.mocked(useContagemFinanceiro).mockReturnValue(null);
  });

  it('Vínculos soma as filas de empenho e os contratos sem ata, quando a carteira já foi carregada', () => {
    definirContagemExtra('contratosAta', 20);
    expect(menu()).toMatch(/data-testid="rail-count-vinculacao"[^>]*>25</);
  });

  it('antes de a carteira carregar, mostra só o que as consultas leves já sabem', () => {
    expect(menu()).toMatch(/data-testid="rail-count-vinculacao"[^>]*>5</);
  });

  it('Alocação mostra os itens a alocar; sem pendência, não mostra número', () => {
    definirContagemExtra('itensAAlocar', 7);
    expect(menu()).toMatch(/data-testid="rail-count-alocacao"[^>]*>7</);
    definirContagemExtra('itensAAlocar', 0);
    expect(menu()).not.toContain('rail-count-alocacao');
  });

  it('gestor de saldos vê o número da Alocação e nenhumos Vínculos', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor_saldos' } as any);
    vi.mocked(useContagemVinculacao).mockReturnValue(null);
    definirContagemExtra('itensAAlocar', 3);
    const html = menu();
    expect(html).toMatch(/data-testid="rail-count-alocacao"[^>]*>3</);
    expect(html).not.toContain('rail-count-vinculacao');
  });

  it('o repositório avisa quem está ouvindo', () => {
    let lido: number | null = -1;
    const Teste = () => {
      lido = useContagensExtras().itensAAlocar;
      return null;
    };
    definirContagemExtra('itensAAlocar', 9);
    renderToStaticMarkup(<Teste />);
    expect(lido).toBe(9);
  });
});

describe('números novos: Financeiro e Início', () => {
  beforeEach(() => {
    zerarContagensExtras();
    vi.mocked(useAuth).mockReturnValue({ role: 'admin' } as any);
    vi.mocked(useContagemVinculacao).mockReturnValue(null);
    vi.mocked(useContagemFinanceiro).mockReturnValue(null);
    vi.mocked(useContagemGruposUasgs).mockReturnValue(null);
    vi.mocked(useContagemEmendas).mockReturnValue(null);
  });

  it('Emendas: pedidos com aviso, vermelho quando há urgente, e o clique abre Pedidos sem filtro', () => {
    vi.mocked(useContagemEmendas).mockReturnValue({ total: 67, urgentes: 8, semPedido: 2 });
    const html = menu();
    expect(html).toMatch(/class="app-rail-count app-rail-count--urgente"[^>]*data-testid="rail-count-emendas"[^>]*>67</);
    expect(html).toContain('href="/emendas/pedidos?ano=todos"');
    vi.mocked(useContagemEmendas).mockReturnValue({ total: 59, urgentes: 0, semPedido: 0 });
    expect(menu()).toMatch(/class="app-rail-count"[^>]*data-testid="rail-count-emendas"[^>]*>59</);
  });

  it('Emendas: só emendas sem pedido, o clique abre Pedidos › Por emenda', () => {
    vi.mocked(useContagemEmendas).mockReturnValue({ total: 3, urgentes: 1, semPedido: 3 });
    const html = menu();
    expect(html).toMatch(/data-testid="rail-count-emendas"[^>]*>3</);
    expect(html).toContain('href="/emendas/emendas?situacao=sem&amp;ano=todos"');
  });

  it('Ajustes (coordenador): UASGs sem grupo confirmado, e o clique abre Grupos das UASGs em "A confirmar"', () => {
    vi.mocked(useContagemGruposUasgs).mockReturnValue({ aConfirmar: 9, semSugestao: 3 });
    const html = menu();
    expect(html).toMatch(/data-testid="rail-count-configuracoes"[^>]*>12</);
    expect(html).toContain('href="/admin/grupos-uasgs?situacao=A_CONFIRMAR"');
  });

  it('Financeiro: "Precisa de ação", vermelho quando urgente, e o clique abre Pagamentos', () => {
    vi.mocked(useContagemFinanceiro).mockReturnValue({ total: 6, urgente: true });
    const html = menu();
    expect(html).toMatch(/class="app-rail-count app-rail-count--urgente"[^>]*data-testid="rail-count-execucao-financeira"[^>]*>6</);
    expect(html).toContain('href="/pagamentos"');
    vi.mocked(useContagemFinanceiro).mockReturnValue({ total: 2, urgente: false });
    expect(menu()).toMatch(/class="app-rail-count"[^>]*data-testid="rail-count-execucao-financeira"[^>]*>2</);
  });

  it('Início (coordenador): atas sem gestor + gestor diferente, e o clique abre a Central', () => {
    definirContagemExtra('atasSemGestor', 182);
    definirContagemExtra('gestorDiferente', 2);
    const html = menu();
    expect(html).toMatch(/data-testid="rail-count-visao-geral"[^>]*>184</);
    expect(html).toContain('href="/atas/distribuicao"');
    definirContagemExtra('atasSemGestor', 0);
    expect(menu()).toContain('href="/atas/distribuicao?aba=DIVERGENCIAS"');
  });

  it('Vínculos abre na primeira fila com pendência', () => {
    vi.mocked(useContagemVinculacao).mockReturnValue({ aosItens: 4, aoContrato: 0, notasForaDoContrato: 0 });
    expect(menu()).toContain('href="/vinculacao/empenhos-itens"');
    vi.mocked(useContagemVinculacao).mockReturnValue({ aosItens: 4, aoContrato: 0, notasForaDoContrato: 5 });
    expect(menu()).toContain('href="/vinculacao/empenhos-contrato?ver=sem-contrato"');
    definirContagemExtra('contratosAta', 1);
    expect(menu()).toContain('href="/vinculacao/contratos"');
  });

  it('sem pendência, nada de número e a área volta à página de sempre', () => {
    const html = menu();
    expect(html).not.toContain('rail-count-');
    expect(html).not.toContain('href="/pagamentos"');
  });
});

describe('subitens de Atas e Contratos', () => {
  beforeEach(() => {
    zerarContagensExtras();
    vi.mocked(useAuth).mockReturnValue({ role: 'admin' } as any);
    vi.mocked(useContagemVinculacao).mockReturnValue({ aosItens: 3, aoContrato: 2, notasForaDoContrato: 0 });
    vi.mocked(useContagemFinanceiro).mockReturnValue({ total: 6, urgente: true });
  });

  it('dentro da área, Alocação, Vínculos e Financeiro aparecem embaixo de Atas e Contratos, cada um com o seu número', () => {
    definirContagemExtra('itensAAlocar', 7);
    const html = menu('/vinculacao/contratos');
    expect(html).toContain('class="app-rail-group" data-aberto="true"');
    expect(html.match(/app-rail-item app-rail-sub/g)).toHaveLength(3);
    expect(html).toMatch(/data-testid="rail-count-alocacao"[^>]*>7</);
    expect(html).toMatch(/data-testid="rail-count-vinculacao"[^>]*>5</);
    expect(html).not.toContain('rail-count-carteira');
  });

  it('fora da área, os subitens somem e Atas e Contratos mostra a soma, vermelha se algum for, levando à 1ª pendência', () => {
    definirContagemExtra('itensAAlocar', 7);
    const html = menu('/emendas/pedidos');
    expect(html).not.toContain('app-rail-sub');
    expect(html).not.toContain('rail-count-alocacao');
    expect(html).toMatch(/class="app-rail-count app-rail-count--urgente"[^>]*data-testid="rail-count-carteira"[^>]*>18</);
    expect(html).toContain('href="/alocacao"');
  });

  it('fora da área e sem pendência nos subitens, nada de número', () => {
    vi.mocked(useContagemVinculacao).mockReturnValue(null);
    vi.mocked(useContagemFinanceiro).mockReturnValue(null);
    expect(menu('/emendas/pedidos')).not.toContain('rail-count-');
  });

  it('no celular, a barra de baixo continua com as áreas lado a lado', () => {
    const html = menu('/emendas/pedidos', 'bottom');
    expect(html).not.toContain('app-rail-group');
    expect(html).toMatch(/data-testid="rail-count-vinculacao"[^>]*>5</);
    expect(html).toMatch(/data-testid="rail-count-execucao-financeira"[^>]*>6</);
  });
});

describe('carga da carteira para o menu', () => {
  it('carrega atas e contratos de cada UASG para quem conta contratos', async () => {
    const { carregarCarteiraParaOMenu } = await import('../cargaDaCarteiraDoMenu');
    const prefetchQuery = vi.fn(() => Promise.resolve());
    await carregarCarteiraParaOMenu({ prefetchQuery } as any, { contratos: true });
    const chaves = prefetchQuery.mock.calls.map((c: any[]) => c[0].queryKey.join(':'));
    expect(chaves).toEqual(['ata-detail-source:200330', 'contracts-dashboard:200330', 'ata-detail-source:200331', 'contracts-dashboard:200331']);
  });

  it('gestor de saldos carrega só as atas', async () => {
    const { carregarCarteiraParaOMenu } = await import('../cargaDaCarteiraDoMenu');
    const prefetchQuery = vi.fn(() => Promise.resolve());
    await carregarCarteiraParaOMenu({ prefetchQuery } as any, { contratos: false });
    expect(prefetchQuery.mock.calls.map((c: any[]) => c[0].queryKey[0])).toEqual(['ata-detail-source', 'ata-detail-source']);
  });
});
