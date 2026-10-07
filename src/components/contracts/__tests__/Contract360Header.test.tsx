import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Contract360Header } from '../Contract360Header';
import * as syncHookModule from '../../../hooks/useSyncContractEmpenhos';
import * as responsaveisHookModule from '../../../hooks/useContractResponsaveis';
import * as garantiasHookModule from '../../../hooks/useContractGarantias';
import * as pncpHookModule from '../../../hooks/useContractPncp';
import * as ataPncpHookModule from '../../../hooks/useAtaPncp';
import type { ContractDashboardRecord } from '../../../types';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', search: '', state: null })
}));

vi.mock('../../../hooks/useSyncContractEmpenhos', () => ({
  useSyncContractEmpenhos: vi.fn()
}));

vi.mock('../../../hooks/useContractResponsaveis', () => ({
  useContractResponsaveis: vi.fn()
}));

vi.mock('../../../hooks/useContractGarantias', () => ({
  useContractGarantias: vi.fn()
}));

vi.mock('../../../hooks/useContractPncp', () => ({
  useContractPncp: vi.fn()
}));

vi.mock('../../../hooks/useAtaPncp', () => ({
  useAtaPncp: vi.fn()
}));

vi.mock('../../../hooks/useItensDoContrato', () => ({
  useItensDoContrato: vi.fn(() => ({ data: undefined }))
}));
vi.mock('../../../hooks/useContractManager', () => ({
  useContractManager: () => ({ data: { gestorNome: 'Maria Fiscal' }, isLoading: false })
}));

vi.mock('../../../hooks/useSaveContractManager', () => ({
  useSaveContractManager: () => ({ mutate: vi.fn(), isPending: false })
}));

vi.mock('../../../hooks/useUsers', () => ({
  useUsers: () => ({ data: [], isLoading: false })
}));

vi.mock('../../../hooks/useRoles', () => ({
  useRoles: () => ({ data: [], isLoading: false })
}));

const mockContract: ContractDashboardRecord = {
  id: '200331-00015-2026',
  numero: '15/2026',
  ano: 2026,
  numeroFormatado: '15/2026',
  uasg: '200331',
  objeto: 'Prestação de serviços contínuos de TI',
  fornecedorNome: 'EMPRESA TECH BRASIL LTDA',
  fornecedorCnpjCpf: '12.345.678/0001-90',
  valorGlobal: 1200000,
  valorInicial: 1000000,
  dataVigenciaInicio: '2026-01-01',
  dataVigenciaFim: '2026-12-31',
  statusVigencia: 'Vigente',
  numeroControlePncp: '200331-2-000015/2026',
  fonteDados: 'PNCP',
  processo: '23000.001234/2026-11'
};

describe('Contract360Header Component — Integração UI de Sincronização de Empenhos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Padrão: as consultas ao Contratos.gov.br ainda não responderam
    vi.mocked(responsaveisHookModule.useContractResponsaveis).mockReturnValue({ data: undefined, isSuccess: false } as any);
    vi.mocked(garantiasHookModule.useContractGarantias).mockReturnValue({ data: undefined, isSuccess: false } as any);
    vi.mocked(pncpHookModule.useContractPncp).mockReturnValue({ data: undefined } as any);
    vi.mocked(ataPncpHookModule.useAtaPncp).mockReturnValue({ data: undefined } as any);
  });

  const defaultMockMutation = {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    data: null,
    reset: vi.fn()
  };

  it('1. deve renderizar o botão "Atualizar empenhos" habilitado para perfil gestor', () => {
    vi.mocked(syncHookModule.useSyncContractEmpenhos).mockReturnValue(defaultMockMutation as any);

    const html = renderToStaticMarkup(
      <Contract360Header contract={mockContract} userRole="gestor" />
    );

    expect(html).toContain('Atualizar empenhos');
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('Atualizando...');
  });

  it('1b. mostra situação no padrão da Carteira e dados cadastrais num só cartão', () => {
    vi.mocked(syncHookModule.useSyncContractEmpenhos).mockReturnValue(defaultMockMutation as any);

    const html = renderToStaticMarkup(
      <Contract360Header contract={mockContract} userRole="gestor">
        <div data-testid="indicadores-filho" />
      </Contract360Header>
    );

    expect(html).toContain('data-testid="instrument-360-status"');
    // A situação não leva os dias: eles ficam só no indicador de prazo
    expect(html).toMatch(/Vigente|Encerrada/);
    expect(html).not.toMatch(/vence em \d+ dias|dias restantes/);
    expect(html).toContain('UASG 200331');
    expect(html).toContain('Contrato nº 15/2026');
    expect(html).toContain('EMPRESA TECH BRASIL LTDA');
    expect(html).toContain('CNPJ 12.345.678/0001-90');
    // Prestação de serviços... vem em frase normal e não é alterada
    expect(html).toContain('Prestação de serviços contínuos de TI');
    expect(html).toContain('23000.001234/2026-11');
    expect(html).toContain('data-testid="indicadores-filho"');
    // Gestor é só informação no 360 (atribuição fica na Carteira)
    expect(html).toContain('data-testid="contract-manager-info"');
    expect(html).not.toContain('Atribuir');
    // Vigência não é mais repetida em bloco próprio no cabeçalho
    expect(html).not.toContain('Vigência Oficial');
    expect(html).not.toContain('Fonte: PNCP');
  });

  it('2. deve renderizar o botão desabilitado com tooltip para perfil consulta (RBAC)', () => {
    vi.mocked(syncHookModule.useSyncContractEmpenhos).mockReturnValue(defaultMockMutation as any);

    const html = renderToStaticMarkup(
      <Contract360Header contract={mockContract} userRole="consulta" />
    );

    expect(html).toContain('Atualizar empenhos');
    expect(html).toContain('disabled=""');
    expect(html).toContain('Você não possui permissão para atualizar empenhos.');
  });

  it('3. deve exibir spinner e estado "Atualizando..." quando a mutação estiver pendente', () => {
    vi.mocked(syncHookModule.useSyncContractEmpenhos).mockReturnValue({
      ...defaultMockMutation,
      isPending: true
    } as any);

    const html = renderToStaticMarkup(
      <Contract360Header contract={mockContract} userRole="gestor" />
    );

    expect(html).toContain('Atualizando...');
    expect(html).toContain('disabled=""');
  });

  it('4. deve exibir banner de feedback SUCESSO quando a orquestração concluir com êxito', () => {
    vi.mocked(syncHookModule.useSyncContractEmpenhos).mockReturnValue({
      ...defaultMockMutation,
      data: {
        status: 'SUCESSO',
        empenhos_encontrados: 3,
        empenhos_persistidos: 3,
        empenhos_atualizados: 0,
        divergencias: [],
        erros: []
      }
    } as any);

    const html = renderToStaticMarkup(
      <Contract360Header contract={mockContract} userRole="gestor" />
    );

    expect(html).toContain('Sincronização concluída. 3 empenho(s) processado(s) e atualizado(s) com sucesso.');
    expect(html).toContain('data-testid="contract-sync-feedback"');
  });

  it('5. deve exibir banner de feedback SEM_DADOS quando nenhum empenho for localizado', () => {
    vi.mocked(syncHookModule.useSyncContractEmpenhos).mockReturnValue({
      ...defaultMockMutation,
      data: {
        status: 'SEM_DADOS',
        empenhos_encontrados: 0,
        empenhos_persistidos: 0,
        empenhos_atualizados: 0,
        divergencias: [],
        erros: []
      }
    } as any);

    const html = renderToStaticMarkup(
      <Contract360Header contract={mockContract} userRole="gestor" />
    );

    expect(html).toContain('O Contratos.gov.br respondeu que este contrato não tem empenho.');
  });

  it('6. deve exibir banner de feedback COM_DIVERGENCIAS informando conflitos detectados', () => {
    vi.mocked(syncHookModule.useSyncContractEmpenhos).mockReturnValue({
      ...defaultMockMutation,
      data: {
        status: 'COM_DIVERGENCIAS',
        empenhos_encontrados: 1,
        empenhos_persistidos: 1,
        empenhos_atualizados: 0,
        divergencias: [
          {
            campo: 'valor_empenhado',
            fonte_a: 'Compras.gov.br',
            valor_a: 50000,
            fonte_b: 'Contratos.gov.br',
            valor_b: 48000
          }
        ],
        erros: []
      }
    } as any);

    const html = renderToStaticMarkup(
      <Contract360Header contract={mockContract} userRole="gestor" />
    );

    expect(html).toContain('Dados sincronizados com 1 divergência(s) entre fontes oficiais.');
  });

  it('7. deve exibir banner de feedback ERRO quando a mutação falhar', () => {
    vi.mocked(syncHookModule.useSyncContractEmpenhos).mockReturnValue({
      ...defaultMockMutation,
      isError: true,
      error: new Error('Falha de comunicação com a API do PNCP')
    } as any);

    const html = renderToStaticMarkup(
      <Contract360Header contract={mockContract} userRole="gestor" />
    );

    expect(html).toContain('Falha de comunicação com a API do PNCP');
  });
  it('mostra órgão, modalidade, nº PNCP e assinatura, com "Não informado" em vez de valor inventado', () => {
    vi.mocked(syncHookModule.useSyncContractEmpenhos).mockReturnValue(defaultMockMutation as any);

    const html = renderToStaticMarkup(
      <Contract360Header contract={{ ...mockContract, dataAssinatura: '2025-12-20' }} userRole="gestor" />
    );

    expect(html).toContain('data-testid="contract-header-metadata"');
    expect(html).toContain('200331-2-000015/2026');
    expect(html).toContain('20/12/2025');
    expect(html).toContain('Não informado');
    expect(html).not.toContain('Pregão Eletrônico (SRP)');
    expect(html).not.toContain('Ministério da Justiça e Segurança Pública');
  });
  describe('fiscais e garantia (Contratos.gov.br)', () => {
    const render = () =>
      renderToStaticMarkup(<Contract360Header contract={{ ...mockContract, dataAssinatura: '2025-12-20' }} userRole="gestor" />);

    beforeEach(() => {
      vi.mocked(syncHookModule.useSyncContractEmpenhos).mockReturnValue(defaultMockMutation as any);
    });

    it('A. enquanto a consulta não responde, o rodapé não mostra fiscal nem "Não informado" para ele', () => {
      const html = render();
      expect(html).not.toContain('Fiscal técnico');
      expect(html).not.toContain('Garantia');
    });

    it('B. mostra o fiscal técnico e o substituto ativos no rodapé, sem CPF', () => {
      vi.mocked(responsaveisHookModule.useContractResponsaveis).mockReturnValue({
        isSuccess: true,
        data: [
          { id: 1, usuario: '***.111.111-** - ANA GESTORA', funcao_id: 'Gestor', situacao: 'Ativo' },
          { id: 2, usuario: '***.222.222-** - ELIANA FISCAL', funcao_id: 'Fiscal Técnico', situacao: 'Ativo' },
          { id: 3, usuario: '***.333.333-** - FABIO SUPLENTE', funcao_id: 'Fiscal Técnico Substituto', situacao: 'Ativo' },
          { id: 4, usuario: '***.444.444-** - CARLOS ANTIGO', funcao_id: 'Fiscal Técnico', situacao: 'Inativo' }
        ]
      } as any);
      const html = render();
      expect(html).toContain('Fiscal técnico');
      expect(html).toContain('ELIANA FISCAL');
      expect(html).toContain('Fiscal técnico substituto');
      expect(html).toContain('FABIO SUPLENTE');
      expect(html).not.toContain('CARLOS ANTIGO');
      // O gestor da tela é o atribuído no sistema; o da API não aparece
      expect(html).not.toContain('ANA GESTORA');
      expect(html).not.toMatch(/\*\*\*|111\.111/);
    });

    it('C. API respondeu sem fiscal: "Fiscal técnico" aparece como não informado', () => {
      vi.mocked(responsaveisHookModule.useContractResponsaveis).mockReturnValue({ isSuccess: true, data: [] } as any);
      const html = render();
      expect(html).toContain('Fiscal técnico');
      expect(html).toContain('Não informado');
    });

    it('D. garantia aparece na linha de datas, com tipo e valor na dica', () => {
      vi.mocked(garantiasHookModule.useContractGarantias).mockReturnValue({
        isSuccess: true,
        data: [
          { id: 1, tipo: 'Depósito Caução', valor: '16.518,66', vencimento: '2027-03-31' },
          { id: 2, tipo: 'Fiança Bancária', valor: '66.074,64', vencimento: '2024-11-19' }
        ]
      } as any);
      const html = render();
      expect(html).toContain('Garantia');
      expect(html).toContain('até 31/03/2027');
      expect(html).toContain('Depósito Caução');
      expect(html).toContain('16.518,66');
      expect(html).toContain('Fiança Bancária');
      // Cobre a vigência (fim em 31/12/2026): sem aviso
      expect(html).not.toContain('vence antes do fim da vigência');
      expect(html).not.toContain('vencida');
    });

    it('E. garantia que vence antes do fim da vigência leva aviso', () => {
      vi.mocked(garantiasHookModule.useContractGarantias).mockReturnValue({
        isSuccess: true,
        data: [{ id: 1, tipo: 'Seguro-garantia', valor: '1.000,00', vencimento: '2999-01-01' }]
      } as any);
      const encurta = renderToStaticMarkup(
        <Contract360Header contract={{ ...mockContract, dataVigenciaFim: '3000-01-01' }} userRole="gestor" />
      );
      expect(encurta).toContain('vence antes do fim da vigência');
    });

    it('F. sem garantia na API, a linha de datas não mostra garantia', () => {
      vi.mocked(garantiasHookModule.useContractGarantias).mockReturnValue({ isSuccess: true, data: [] } as any);
      expect(render()).not.toContain('Garantia');
    });
  });
  describe('divulgação e Id no PNCP', () => {
    const render = (c = mockContract) =>
      renderToStaticMarkup(<Contract360Header contract={{ ...c, dataAssinatura: '2025-12-20' }} userRole="gestor" />);

    beforeEach(() => {
      vi.mocked(syncHookModule.useSyncContractEmpenhos).mockReturnValue(defaultMockMutation as any);
    });

    it('G. sem resposta do PNCP, a linha da divulgação continua e diz "não informada"', () => {
      const html = render();
      expect(html).toContain('Divulgação no PNCP');
      expect(html).toContain('não informada');
    });

    it('G2. enquanto o PNCP ainda responde, a linha da divulgação não aparece', () => {
      vi.mocked(pncpHookModule.useContractPncp).mockReturnValue({ data: undefined, isLoading: true } as any);
      expect(render()).not.toContain('Divulgação no PNCP');
    });

    it('G3. sem assinatura no registro, a linha diz "não informada"; enquanto completa com o Contratos.gov.br, espera', () => {
      const semAssinatura = { ...mockContract, dataAssinatura: undefined };
      const pronto = renderToStaticMarkup(<Contract360Header contract={semAssinatura} userRole="gestor" />);
      expect(pronto).toContain('O Contratos.gov.br não informou a data de assinatura deste contrato.');
      const carregando = renderToStaticMarkup(<Contract360Header contract={semAssinatura} userRole="gestor" loadingOfficial />);
      expect(carregando).not.toContain('Assinatura');
    });

    it('G4. a categoria vem de `categoria` (Contratos.gov.br) ou de `nomeCategoria` (Compras.gov.br)', () => {
      expect(render({ ...mockContract, raw: { categoria: 'Compras' } })).toContain('Compras');
      const compras = render({ ...mockContract, raw: { nomeCategoria: 'Serviços' } });
      expect(compras).toContain('Categoria');
      expect(compras).toContain('Serviços');
    });

    it('H. com a resposta do PNCP, mostra a divulgação entre a assinatura e a vigência', () => {
      vi.mocked(pncpHookModule.useContractPncp).mockReturnValue({
        data: { numeroControlePncp: '200331-2-000015/2026', dataPublicacaoPncp: '2025-12-21' }
      } as any);
      const html = render();
      expect(html).toContain('Divulgação no PNCP');
      expect(html).toContain('21/12/2025');
      const ordem = ['Assinatura', 'Divulgação no PNCP', 'Vigência'].map((t) => html.indexOf(t));
      expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    });

    it('I. contrato sem Id PNCP no cadastro usa o que o PNCP devolveu, no rodapé e no link', () => {
      vi.mocked(pncpHookModule.useContractPncp).mockReturnValue({
        data: { numeroControlePncp: '00394494000136-2-001220/2026', dataPublicacaoPncp: '2026-07-07' }
      } as any);
      const html = render({ ...mockContract, numeroControlePncp: undefined });
      expect(html).toContain('00394494000136-2-001220/2026');
      expect(html).toContain('https://pncp.gov.br/app/contratos/00394494000136-2-001220/2026');
    });

    it('J. sem Id no cadastro e sem resposta do PNCP, o campo Id PNCP some e não há link', () => {
      const html = render({ ...mockContract, numeroControlePncp: undefined });
      expect(html).not.toContain('Contrato no PNCP');
      expect(html).not.toContain('Id PNCP');
      // Os outros identificadores continuam, e o que falta neles segue como "Não informado"
      expect(html).toContain('Processo');
    });

    it('J2. com o Id no cadastro, o rodapé mostra o Id PNCP', () => {
      const html = render();
      expect(html).toContain('Id PNCP');
      expect(html).toContain('200331-2-000015/2026');
    });
  });
  describe('ata de origem', () => {
    const ID_ATA = '00394494000136-1-000916/2025-000001';
    const render = () => renderToStaticMarkup(<Contract360Header contract={mockContract} userRole="gestor" />);

    beforeEach(() => {
      vi.mocked(syncHookModule.useSyncContractEmpenhos).mockReturnValue(defaultMockMutation as any);
    });

    it('K. contrato sem ata de origem não leva a linha', () => {
      vi.mocked(pncpHookModule.useContractPncp).mockReturnValue({
        data: { numeroControlePncp: '200331-2-000015/2026', dataPublicacaoPncp: '2026-01-02' }
      } as any);
      expect(render()).not.toContain('Ata de origem');
    });

    it('L. com a ata de origem de uma UASG do CGLIC, o número é um link para a Ata 360', () => {
      vi.mocked(pncpHookModule.useContractPncp).mockReturnValue({
        data: { numeroControlePncp: '200331-2-000015/2026', dataPublicacaoPncp: '2026-01-02', numeroControlePncpAta: ID_ATA }
      } as any);
      vi.mocked(ataPncpHookModule.useAtaPncp).mockReturnValue({
        data: { numeroAtaRegistroPreco: '00059', anoAta: 2025, codigoUnidade: '200331' }
      } as any);
      const html = render();
      expect(html).toContain('Ata de origem');
      expect(html).toContain('data-testid="instrument-360-origin"');
      expect(html).toContain('nº 00059/2025');
      expect(html).toMatch(/<button[^>]*>nº 00059\/2025<\/button>/);
      // A consulta da ata usa o Id PNCP que o contrato trouxe
      expect(vi.mocked(ataPncpHookModule.useAtaPncp)).toHaveBeenCalledWith({ numeroControlePncpAta: ID_ATA });
    });

    it('M. ata de outra UASG não tem Ata 360 aqui: o número aparece como texto, sem link', () => {
      vi.mocked(pncpHookModule.useContractPncp).mockReturnValue({
        data: { numeroControlePncp: '200331-2-000015/2026', dataPublicacaoPncp: '2026-01-02', numeroControlePncpAta: ID_ATA }
      } as any);
      vi.mocked(ataPncpHookModule.useAtaPncp).mockReturnValue({
        data: { numeroAtaRegistroPreco: '00007', anoAta: 2025, codigoUnidade: '110099' }
      } as any);
      const html = render();
      expect(html).toContain('nº 00007/2025');
      expect(html).not.toMatch(/<button[^>]*>nº 00007/);
    });

    it('N. enquanto os dados da ata não chegam, não mostra a linha', () => {
      vi.mocked(pncpHookModule.useContractPncp).mockReturnValue({
        data: { numeroControlePncp: '200331-2-000015/2026', dataPublicacaoPncp: '2026-01-02', numeroControlePncpAta: ID_ATA }
      } as any);
      expect(render()).not.toContain('Ata de origem');
    });
  });
});
