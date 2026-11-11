import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../../hooks/useContractsPortfolio', () => ({ useContractsPortfolio: vi.fn() }));
vi.mock('../../../hooks/useFiscalizacao', () => ({ useContratosFiscalizacao: vi.fn() }));

import { useAuth } from '../../../context/AuthContext';
import { useContractsPortfolio } from '../../../hooks/useContractsPortfolio';
import { useContratosFiscalizacao } from '../../../hooks/useFiscalizacao';
import { useContratosDoFinanceiro } from '../useContratosDoFinanceiro';

const Escopo: React.FC = () => {
  const { escopo, isLoading, contratosNaoCarregaram } = useContratosDoFinanceiro();
  return <span>{isLoading ? 'carregando' : contratosNaoCarregaram ? 'falhou' : escopo ? [...escopo].sort().join(',') : 'todos'}</span>;
};
const render = () => renderToStaticMarkup(<Escopo />);
const linha = (contractKey: string) => ({ contractKey, contract: {}, faixa: 'VIGENTE' });

describe('recorte do Financeiro por perfil', () => {
  beforeEach(() => {
    vi.mocked(useContractsPortfolio).mockReturnValue({ rows: [linha('A'), linha('B')], isLoading: false, isLoadingScope: false, leiturasDosContratos: [] } as any);
    vi.mocked(useContratosFiscalizacao).mockReturnValue({
      data: [{ contractKey: 'A', fiscalUserId: 'eu' }, { contractKey: 'C', fiscalUserId: 'outro' }, { contractKey: 'D', fiscalUserId: 'eu' }, { contractKey: 'E', fiscalUserId: null }],
      isLoading: false,
      isError: false
    } as any);
  });

  it('coordenador e consulta: sem recorte; não leem a Fiscalização', () => {
    for (const role of ['admin', 'leitor']) {
      vi.mocked(useAuth).mockReturnValue({ role, user: { id: 'eu' } } as any);
      expect(render()).toContain('todos');
      expect(useContratosFiscalizacao).toHaveBeenLastCalledWith({ enabled: false });
    }
  });

  it('gestor de contratos e atas: só os contratos da carteira dele', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor', user: { id: 'eu' } } as any);
    expect(render()).toContain('A,B');
  });

  it('gestor de fiscalização: só os contratos em que é o fiscal', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor_fiscalizacao', user: { id: 'eu' } } as any);
    expect(render()).toContain('A,D');
    expect(useContratosFiscalizacao).toHaveBeenLastCalledWith({ enabled: true });
  });

  it('gestor de fiscalização: espera a Fiscalização e avisa se ela falhar (não mostra o Financeiro inteiro)', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor_fiscalizacao', user: { id: 'eu' } } as any);
    vi.mocked(useContratosFiscalizacao).mockReturnValue({ data: undefined, isLoading: true, isError: false } as any);
    expect(render()).toContain('carregando');
    vi.mocked(useContratosFiscalizacao).mockReturnValue({ data: undefined, isLoading: false, isError: true } as any);
    expect(render()).toContain('falhou');
  });
});
