import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { mapDistribuicao } from '../../../services/distribuicaoEmpenhoService';
import { linhaForaDoContrato } from '../../../services/empenhosForaDoContratoService';

vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn(() => ({ role: 'admin' })) }));
vi.mock('../../../hooks/useVinculacaoEmpenhos', () => ({ useEmpenhosParaVincularAosItens: vi.fn() }));
vi.mock('../../../hooks/useEmpenhosForaDoContrato', () => ({ useEmpenhosForaDoContrato: vi.fn() }));
vi.mock('../../financeiro/useContratosDoFinanceiro', () => ({ useContratosDoFinanceiro: vi.fn() }));
vi.mock('../../layout/useTelaCarregada', () => ({ useTelaCarregada: vi.fn(() => true) }));

import { useAuth } from '../../../context/AuthContext';
import { useEmpenhosParaVincularAosItens } from '../../../hooks/useVinculacaoEmpenhos';
import { useEmpenhosForaDoContrato } from '../../../hooks/useEmpenhosForaDoContrato';
import { useContratosDoFinanceiro } from '../../financeiro/useContratosDoFinanceiro';
import { useTelaCarregada } from '../../layout/useTelaCarregada';
import { useContagemVinculacao } from '../useContagemVinculacao';

const Numero: React.FC = () => {
  const n = useContagemVinculacao();
  return <span>{n ? `${n.aosItens}/${n.aoContrato}` : 'nulo'}</span>;
};
const render = () => renderToStaticMarkup(<Numero />);
const nota = (ne: string, contractKey: string, situacao = 'A_DISTRIBUIR') =>
  mapDistribuicao({ contrato_empenho_id: ne, contract_key: contractKey, empenho_id: ne, numero_oficial: ne, valor_nota: 100, itens_no_contrato: 2, parcelas: [], sugestao: [], situacao });
const fora = (id: number, contractKey: string, situacao = 'A_CONFERIR') =>
  linhaForaDoContrato({ id_fatura: id, contract_key: contractKey, id_empenho_gov: `g${id}`, numero_empenho: `2024NE${id}`, fatura_valor_liquido: 10, outros_contratos: [], homonimas: [], outras_notas_da_fatura: [], veredito: 'FORA_DOS_CONTRATOS', situacao });
// VIG vigente, ENC encerrado, SEM sem data de fim (conta como vigente).
const contratos = (escopo: Set<string> | null, isLoading = false) =>
  vi.mocked(useContratosDoFinanceiro).mockReturnValue({ contrato: (k: string) => ({ numero: k, expirado: k === 'ENC' }), escopo, isLoading, lista: [], showGestorFilter: true } as any);

describe('número do menu Vínculos (empenhos)', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ role: 'admin' } as any);
    vi.mocked(useTelaCarregada).mockReturnValue(true);
    vi.mocked(useEmpenhosParaVincularAosItens).mockReturnValue({ data: [nota('a', 'VIG'), nota('b', 'VIG', 'REVISAR'), nota('c', 'ENC'), nota('d', 'SEM'), nota('e', 'VIG', 'DISTRIBUIDA')] } as any);
    vi.mocked(useEmpenhosForaDoContrato).mockReturnValue({ data: [fora(1, 'VIG'), fora(2, 'ENC'), fora(3, 'SEM'), fora(4, 'VIG', 'CORRIGINDO')] } as any);
    contratos(null);
  });

  it('conta só contratos vigentes (sem data de fim conta como vigente); encerrados ficam fora', () => {
    expect(render()).toContain('3/2');
  });

  it('gestor: só os próprios contratos', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor' } as any);
    contratos(new Set(['ENC', 'SEM']));
    expect(render()).toContain('1/1');
  });

  it('espera a carteira para saber quais contratos estão encerrados', () => {
    contratos(null, true);
    expect(render()).toContain('nulo');
  });

  it('antes de a tela aberta encher, as filas não são lidas e não há número', () => {
    vi.mocked(useTelaCarregada).mockReturnValue(false);
    expect(render()).toContain('nulo');
    expect(useEmpenhosParaVincularAosItens).toHaveBeenLastCalledWith(false);
    expect(useEmpenhosForaDoContrato).toHaveBeenLastCalledWith(false);
    // A carteira de contratos também espera (passo 3 da auditoria das telas).
    expect(useContratosDoFinanceiro).toHaveBeenLastCalledWith({ enabled: false });
  });

  it('consulta e gestor de saldo não têm o número', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'leitor' } as any);
    expect(render()).toContain('nulo');
  });

  it('contratos que não carregaram: sem número (a vigência e o recorte dependem deles), em vez de um número errado', () => {
    vi.mocked(useContratosDoFinanceiro).mockReturnValue({
      contrato: (k: string) => ({ numero: k }),
      escopo: null,
      isLoading: false,
      lista: [],
      showGestorFilter: true,
      contratosNaoCarregaram: true
    } as any);
    expect(render()).toContain('nulo');
  });
});
