import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SincronizacaoEmpenhosContrato } from '../../../services/contratoEmpenhosSincronizacaoService';

vi.mock('../../../hooks/useDetailOrigin', () => ({ useNavigateWithOrigin: () => vi.fn() }));
vi.mock('../../../hooks/useContractEmpenhoItemLinks', () => ({ useContractEmpenhoItemLinks: () => ({ data: [] }) }));
vi.mock('../../../hooks/useContractFinancialSummary', () => ({ useContractFinancialSummary: vi.fn() }));
vi.mock('../../../hooks/useSincronizacaoEmpenhosContrato', () => ({ useSincronizacaoEmpenhosContrato: vi.fn() }));
vi.mock('../../../hooks/useVinculoEmpenhosContrato', () => {
  const mut = () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null, variables: undefined });
  return {
    useDescartesEmpenhoContrato: vi.fn(() => ({ data: [] })),
    useAcoesVinculoEmpenho: () => ({ descartar: mut(), restaurar: mut(), vincular: mut(), desvincular: mut() }),
    useBuscaEmpenhoPorNumero: () => ({ data: [], isLoading: false, isError: false })
  };
});
vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn(() => ({ role: 'leitor' })) }));

import { useContractFinancialSummary } from '../../../hooks/useContractFinancialSummary';
import { useSincronizacaoEmpenhosContrato } from '../../../hooks/useSincronizacaoEmpenhosContrato';
import { useDescartesEmpenhoContrato } from '../../../hooks/useVinculoEmpenhosContrato';
import { useAuth } from '../../../context/AuthContext';
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

  it('NE compartilhada: mostra o outro contrato e o valor que entra inteiro nos dois', () => {
    vi.mocked(useContractFinancialSummary).mockReturnValue({
      ...comEmpenho,
      empenhosList: [{ ...comEmpenho.empenhosList[0], outros_contratos: ['200331-00005-2017'] }]
    } as any);
    vi.mocked(useSincronizacaoEmpenhosContrato).mockReturnValue({ data: sync({}) } as any);
    const html = render();
    expect(html).toContain('contract-financial-ne-compartilhada');
    expect(html).toContain('também em');
    expect(html).toContain('00005/2017');
    expect(html).toContain('contract-financial-compartilhadas');
    expect(html).toContain('entra inteiro no total de');
  });

  it('aviso da consulta (vínculo removido) aparece sem rótulo de PNCP', () => {
    vi.mocked(useContractFinancialSummary).mockReturnValue(comEmpenho as any);
    vi.mocked(useSincronizacaoEmpenhosContrato).mockReturnValue({
      data: sync({ mensagem: '1 empenho(s) desvinculado(s) porque o Contratos.gov.br não os lista mais neste contrato: 2024NE000029.' })
    } as any);
    const html = render();
    expect(html).toContain('contract-financial-sync-pncp');
    expect(html).toContain('1 empenho(s) desvinculado(s)');
    expect(html).not.toContain('Conferência com o PNCP: 1 empenho');
  });
});

describe('ContractFinancialExecutionSection: vínculo híbrido', () => {
  const equilibrio = { ...contract, id: '200331-00145-2025', numero: '00145/2025', fornecedorNome: 'EQUILIBRIO EQUIPAMENTOS DE PROTECAO AMBIENTAL LTDA', fornecedorCnpjCpf: '12.124.712/0001-00' };
  const linha = (over: any) => ({ canonical_key: over.numero_oficial, data_emissao: '2025-10-29', valor_liquidado: 0, valor_pago: 0, origem_vinculo: 'FONTE', ...over });
  const lista = {
    ...comEmpenho,
    empenhosList: [
      linha({ empenho_id: 'eq', numero_oficial: '2025NE000265', credor_nome: 'EQUILIBRIO EQUIPAMENTOS', credor_cnpj_cpf: '12.124.712/0001-00', valor_empenhado: 1523200 }),
      linha({ empenho_id: 'hpe', numero_oficial: '2024NE000765', credor_nome: 'HPE AUTOMOTORES DO BRASIL LTDA', credor_cnpj_cpf: '54.305.743/0011-70', valor_empenhado: 567513.93 }),
      linha({ empenho_id: 'man', numero_oficial: '2025NE000999', credor_nome: 'EQUILIBRIO EQUIPAMENTOS', credor_cnpj_cpf: '12.124.712/0001-00', valor_empenhado: 27200, origem_vinculo: 'MANUAL', vinculado_por_nome: 'Maria', motivo_manual: 'Conferido no SIAFI' })
    ]
  };
  const renderEq = () => renderToStaticMarkup(<ContractFinancialExecutionSection contract={equilibrio} contractKey={equilibrio.id} />);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSincronizacaoEmpenhosContrato).mockReturnValue({ data: null } as any);
    vi.mocked(useContractFinancialSummary).mockReturnValue(lista as any);
  });

  it('alerta a NE cujo credor não é o fornecedor do contrato, só nela', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'leitor' } as any);
    const html = renderEq();
    expect(html).toContain('contract-financial-credor-divergente');
    expect(html.match(/data-testid="contract-financial-credor-diverge"/g)).toHaveLength(1);
    expect(html).toContain('<strong>2024NE000765</strong>');
    expect(html).toContain('retire a nota do contrato no Contratos.gov.br');
  });

  it('marca o vínculo feito pela equipe e explica que a sincronização não o remove', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'leitor' } as any);
    const html = renderEq();
    expect(html).toContain('contract-financial-vinculo-manual');
    expect(html).toContain('contract-financial-manuais');
  });

  it('leitor não vê as ações; gestor só desvincula o manual e não descarta o que veio da fonte', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'leitor' } as any);
    let html = renderEq();
    expect(html).not.toContain('contract-financial-desvincular');
    expect(html).not.toContain('contract-financial-vincular');

    vi.mocked(useAuth).mockReturnValue({ role: 'gestor' } as any);
    html = renderEq();
    expect(html).not.toContain('contract-financial-descartar');
    expect(html).not.toContain('descartar-empenho-modal');
    expect(html.match(/data-testid="contract-financial-desvincular"/g)).toHaveLength(1);
    expect(html).toContain('contract-financial-vincular');
    expect(html).toContain('retire a nota do contrato no Contratos.gov.br');
  });

  it('lista os descartados com motivo e autor; restaurar só para gestor', () => {
    vi.mocked(useDescartesEmpenhoContrato).mockReturnValue({
      data: [{ contractKey: equilibrio.id, empenhoId: 'x', motivo: 'Credor é a HPE', descartadoPorNome: 'Maria', descartadoEm: '2026-10-06T20:00:00Z', numeroOficial: '2024NE000765', credorNome: 'HPE AUTOMOTORES', valorEmpenhado: 567513.93 }]
    } as any);
    vi.mocked(useAuth).mockReturnValue({ role: 'admin' } as any);
    let html = renderEq();
    expect(html).toContain('Empenhos descartados');
    expect(html).toContain('Credor é a HPE');
    expect(html).toContain('contract-financial-restaurar');
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor_saldos' } as any);
    html = renderEq();
    expect(html).toContain('Empenhos descartados');
    expect(html).not.toContain('contract-financial-restaurar');
  });

  it('contrato sem empenho: gestor pode vincular à mão e vê os descartados', () => {
    vi.mocked(useContractFinancialSummary).mockReturnValue(vazio as any);
    vi.mocked(useDescartesEmpenhoContrato).mockReturnValue({
      data: [{ contractKey: equilibrio.id, empenhoId: 'x', motivo: 'Credor é a HPE', numeroOficial: '2024NE000765' }]
    } as any);
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor' } as any);
    const html = renderEq();
    expect(html).toContain('contract-financial-empty');
    expect(html).toContain('contract-financial-vincular');
    expect(html).toContain('contract-financial-descartados');
  });
});
