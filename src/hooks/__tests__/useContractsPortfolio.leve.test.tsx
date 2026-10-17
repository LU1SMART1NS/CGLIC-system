/**
 * Passo 3 da auditoria das telas (6a): a versão leve da carteira de contratos não lê o painel do Início. Prova que
 * ela não pede o painel e que número, fornecedor, gestor, vigência e o recorte do gestor saem iguais aos da
 * versão completa; só as pendências ficam de fora.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const { painel } = vi.hoisted(() => ({ painel: { chamadas: [] as Array<{ uasg: string; enabled: boolean }> } }));

const consulta = <T,>(data: T) => ({ data, isLoading: false, isFetching: false, isError: false, error: null, dataUpdatedAt: 1, refetch: vi.fn() });

const contrato = (numero: string, uasg: string, extra: Record<string, unknown> = {}) => ({
  id: `${uasg}-${numero}-2025`,
  numero,
  ano: 2025,
  uasg,
  fornecedorNome: `Fornecedor ${numero}`,
  fornecedorCnpjCpf: '00.000.000/0001-00',
  dataVigenciaFim: '2030-01-01',
  statusVigencia: 'Vigente',
  valorGlobal: 1000,
  ...extra
});

vi.mock('../useContractsDashboard', () => ({
  useContractsDashboard: (uasg: string) =>
    consulta(uasg === '200330' ? [contrato('00001', '200330')] : [contrato('00002', '200331'), contrato('00003', '200331', { dataVigenciaFim: '2020-01-01', statusVigencia: 'Expirado' })])
}));
vi.mock('../useSincronizacaoContratos', () => ({
  useSincronizacaoContratos: () => ({ sincronizando: false, incompleta: false, ultimoSucessoEm: null, atualizar: vi.fn(), podeForcar: true, fontesComFalha: [] })
}));
vi.mock('../useAssignedManagementScope', async (orig) => ({
  ...(await orig<typeof import('../useAssignedManagementScope')>()),
  useAssignedManagementScope: () => ({ isLoading: false, contractKeys: undefined, ataKeys: undefined, leituras: [] })
}));
vi.mock('../useAllContractManagers', () => ({
  useAllContractManagers: (uasg: string) => consulta(uasg === '200331' ? { '200331-00002-2025': { gestorNome: 'Ana' } } : {})
}));
vi.mock('../useAtaManagers', () => ({ useArpItemContractLinks: () => consulta([{ ataKey: '00010/2024-200331', contractKey: '200331-00002-2025' }]) }));
vi.mock('../useManagementDashboard', () => ({
  useManagementDashboard: (filtros: { uasg: string }, opts: { enabled?: boolean }) => {
    painel.chamadas.push({ uasg: filtros.uasg, enabled: opts.enabled ?? true });
    // Painel no cache (o Início já abriu): a versão leve não pode usá-lo mesmo assim.
    const items = filtros.uasg === '200331' ? [{ id: 'a1', category: 'PRAZO', severity: 'URGENTE', title: 'Vence', contractKey: '200331-00002-2025' }] : [];
    return { readModel: { attention: { items } }, isLoading: false, isError: false, error: null, refetch: vi.fn() };
  }
}));

import { useContractsPortfolio } from '../useContractsPortfolio';

function rodar(opcoes?: { pendencias?: boolean }) {
  let r: ReturnType<typeof useContractsPortfolio> | undefined;
  const Sonda = () => {
    r = useContractsPortfolio(opcoes);
    return null;
  };
  renderToStaticMarkup(<Sonda />);
  return r!;
}

describe('useContractsPortfolio — versão leve, sem o painel do Início', () => {
  beforeEach(() => {
    painel.chamadas = [];
  });

  it('a versão completa (Carteira de Contratos) continua pedindo o painel das duas UASGs e mostrando as pendências', () => {
    const r = rodar();
    expect(painel.chamadas).toEqual([
      { uasg: '200330', enabled: true },
      { uasg: '200331', enabled: true }
    ]);
    expect(r.attentionItems).toHaveLength(1);
    expect(r.rows.find((x) => x.contractKey === '200331-00002-2025')?.pendencias).toHaveLength(1);
    expect(r.pendenciasCarregando).toBe(false);
  });

  it('a versão leve não pede o painel (as duas consultas ficam desligadas) e ignora o que estiver no cache', () => {
    const r = rodar({ pendencias: false });
    expect(painel.chamadas.every((c) => c.enabled === false)).toBe(true);
    expect(r.attentionItems).toEqual([]);
    expect(r.rows.every((x) => x.pendencias.length === 0)).toBe(true);
    expect(r.pendenciasCarregando).toBe(false);
    expect(r.pendenciasComErro).toBe(false);
  });

  it('número, fornecedor, gestor, vigência, faixa e atas saem iguais nas duas versões', () => {
    const semPendencias = (rows: ReturnType<typeof useContractsPortfolio>['rows']) => rows.map(({ pendencias: _p, ...resto }) => resto);
    const completa = rodar();
    const leve = rodar({ pendencias: false });
    expect(semPendencias(leve.rows)).toEqual(semPendencias(completa.rows));
    expect(leve.rows).toHaveLength(3);
    expect(leve.rows.map((x) => [x.contractKey, x.gestorNome, x.faixa])).toEqual([
      ['200330-00001-2025', undefined, completa.rows[0].faixa],
      ['200331-00002-2025', 'Ana', completa.rows[1].faixa],
      ['200331-00003-2025', undefined, 'EXPIRADO']
    ]);
    expect([...leve.contractsByKey.keys()]).toEqual([...completa.contractsByKey.keys()]);
    expect(leve.leiturasDosContratos.map((l) => l.rotulo)).toEqual(completa.leiturasDosContratos.map((l) => l.rotulo));
  });
});
