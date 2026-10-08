import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { contarItensAAlocar, definirContagemExtra, useContagensExtras, zerarContagensExtras } from '../contagemExtras';

vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn(() => ({ role: 'admin' })) }));
vi.mock('../useContagemVinculacao', () => ({ useContagemVinculacao: vi.fn(() => 5) }));
// O espião do cache e os cálculos pesados não rodam no render estático: o que interessa aqui é o número no ícone.
vi.mock('../ContagensDaCarteira', () => ({ ContagensDaCarteira: () => null }));

import { useAuth } from '../../../context/AuthContext';
import { useContagemVinculacao } from '../useContagemVinculacao';
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

const menu = () =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/instrumentos']}>
      <Sidebar mode="rail" />
    </MemoryRouter>
  );

describe('número no ícone das áreas', () => {
  beforeEach(() => {
    zerarContagensExtras();
    vi.mocked(useAuth).mockReturnValue({ role: 'admin' } as any);
    vi.mocked(useContagemVinculacao).mockReturnValue(5);
  });

  it('Vinculação soma as filas de empenho e os contratos sem ata, quando a carteira já foi carregada', () => {
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

  it('gestor de saldos vê o número da Alocação e nenhuma Vinculação', () => {
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
