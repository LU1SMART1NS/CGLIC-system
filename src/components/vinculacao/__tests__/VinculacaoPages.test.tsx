import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { mapDistribuicao } from '../../../services/distribuicaoEmpenhoService';

vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn(() => ({ role: 'gestor' })) }));
vi.mock('../../../hooks/useDetailOrigin', () => ({ useNavigateWithOrigin: () => vi.fn() }));
vi.mock('../../../hooks/useVinculacaoEmpenhos', () => ({ useEmpenhosParaVincularAosItens: vi.fn() }));
vi.mock('../../../hooks/useConferenciaNota', () => ({
  useConferenciasDaNota: vi.fn(() => ({ data: [] })),
  useAcoesCorrecaoDaNota: () => ({ marcar: { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }, desfazer: { mutate: vi.fn(), isPending: false } })
}));
vi.mock('../../../hooks/usePagamentoDaFatura', () => ({ usePagamentoDaFatura: () => ({ data: null }) }));
vi.mock('../../../hooks/useEmpenhosForaDoContrato', () => ({
  useEmpenhosForaDoContrato: vi.fn(),
  useAcoesCorrecaoNaFonte: () => ({ marcar: { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }, desfazer: { mutate: vi.fn(), isPending: false } })
}));
vi.mock('../../financeiro/useContratosDoFinanceiro', async (orig) => ({
  ...(await orig<typeof import('../../financeiro/useContratosDoFinanceiro')>()),
  useContratosDoFinanceiro: vi.fn()
}));
vi.mock('../../../hooks/useAtasPortfolio', async (orig) => ({ ...(await orig<typeof import('../../../hooks/useAtasPortfolio')>()), useAtasPortfolio: vi.fn() }));
vi.mock('../../../hooks/useCarteiraItens', () => ({ useCarteiraItens: vi.fn() }));
vi.mock('../../../hooks/useAvisosResolvidos', async (orig) => ({ ...(await orig<typeof import('../../../hooks/useAvisosResolvidos')>()), useAvisosResolvidos: vi.fn() }));
// Janelas: não abrem no render estático; os hooks delas não rodam.
vi.mock('../VincularAosItensDialog', () => ({ VincularAosItensDialog: () => null }));
vi.mock('../../alocacao/AlocarUnidadeModal', () => ({ AlocarUnidadeModal: () => null }));
vi.mock('@tanstack/react-query', async (orig) => ({ ...(await orig<typeof import('@tanstack/react-query')>()), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));

import { useAuth } from '../../../context/AuthContext';
import { useEmpenhosParaVincularAosItens } from '../../../hooks/useVinculacaoEmpenhos';
import { useConferenciasDaNota } from '../../../hooks/useConferenciaNota';
import { mapConferencia } from '../../../services/conferenciaNotaService';
import { mapNotaSiafi } from '../../../services/distribuicaoEmpenhoService';
import { useEmpenhosForaDoContrato } from '../../../hooks/useEmpenhosForaDoContrato';
import { linhaForaDoContrato } from '../../../services/empenhosForaDoContratoService';
import { PainelDaConferencia } from '../ConferenciaForaDoContrato';
import { useContratosDoFinanceiro } from '../../financeiro/useContratosDoFinanceiro';
import { useAtasPortfolio } from '../../../hooks/useAtasPortfolio';
import { useCarteiraItens } from '../../../hooks/useCarteiraItens';
import { useAvisosResolvidos } from '../../../hooks/useAvisosResolvidos';
import { chaveAvisoDeixarFatura, chaveAvisoDeixarNota } from '../../../services/avisosResolvidosService';
import { EmpenhosItensPage } from '../EmpenhosItensPage';
import { EmpenhosContratoPage } from '../EmpenhosContratoPage';
import { ItensUnidadesPage } from '../../alocacao/ItensUnidadesPage';

const render = (el: React.ReactElement, url = '/') => renderToStaticMarkup(<MemoryRouter initialEntries={[url]}>{el}</MemoryRouter>);
// K3: contrato encerrado em 06/05/2025.
const contratos = (escopo: Set<string> | null = null) =>
  vi.mocked(useContratosDoFinanceiro).mockReturnValue({
    contrato: (k: string) => ({
      numero: k === 'K1' ? '00002/2025' : k === 'K3' ? '00026/2024' : '00009/2025',
      fornecedorNome: 'INBRA',
      gestorNome: 'Maria',
      expirado: k === 'K3',
      vigenciaFim: k === 'K3' ? '2025-05-06' : undefined
    }),
    lista: [],
    escopo,
    showGestorFilter: escopo === null,
    isLoading: false,
    leituras: [],
    contratosNaoCarregaram: false
  } as any);
/** Marcas "Deixar como está" gravadas (avisos_resolvidos). */
const deixadas = (...chaves: string[]) =>
  vi.mocked(useAvisosResolvidos).mockReturnValue({
    porChave: new Map(chaves.map((c) => [c, { chave: c, tipo: 'FONTE', justificativa: 'Contrato encerrado e pago; nada mais muda.', resolvidoPorNome: 'João', resolvidoEm: '2026-10-15T12:00:00Z' }])),
    resolver: { mutateAsync: vi.fn() },
    reexibir: { mutate: vi.fn(), isPending: false },
    podeResolver: true,
    podeConcluirTarefas: true,
    consulta: { data: [], isError: false, error: null, refetch: vi.fn() }
  } as any);
const nota = (over: any) =>
  mapDistribuicao({ contrato_empenho_id: over.ne, contract_key: 'K1', empenho_id: over.ne, numero_oficial: over.ne, valor_nota: 14700, itens_no_contrato: 3, parcelas: [], sugestao: [], situacao: 'A_DISTRIBUIR', ...over });

describe('Vínculos → Empenhos aos itens', () => {
  beforeEach(() => {
    vi.mocked(useConferenciasDaNota).mockReturnValue({ data: [] } as any);
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor' } as any);
    contratos(new Set(['K1', 'K3']));
    deixadas();
    vi.mocked(useEmpenhosParaVincularAosItens).mockReturnValue({
      data: [
        nota({ ne: '2024NE000328', sugestao_tipo: 'MULTIPLO_DO_PRECO', sugestao: [{ numero_item: 13, quantidade: 3 }] }),
        nota({ ne: '2024NE000022', contract_key: 'K3' }),
        nota({ ne: '2024NE000330', situacao: 'REVISAR', motivo_revisao: 'VALOR_MUDOU', valor_na_distribuicao: 9800, origem: 'USUARIO' }),
        nota({ ne: '2026NE000001', contract_key: 'OUTRO' }),
        nota({ ne: '2024NE000337', situacao: 'DISTRIBUIDA', origem: 'USUARIO', parcelas: [{ numero_item: 43, valor: 14700 }], distribuido_por_nome: 'Maria' }),
        nota({ ne: '2024NE000340', situacao: 'DISTRIBUIDA', origem: 'VALOR', parcelas: [{ numero_item: 13, valor: 14700 }], observacao: 'Valor da nota = 3 × preço unitário do item 13.' })
      ],
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn()
    } as any);
  });

  it('gestor vê só as notas dos próprios contratos, a rever primeiro, com o botão de vincular', () => {
    const html = render(<EmpenhosItensPage />);
    expect(html).toContain('Empenhos a vincular aos itens');
    expect(html).toContain('2024NE000328');
    expect(html).not.toContain('2026NE000001');
    expect(html.indexOf('2024NE000330')).toBeLessThan(html.indexOf('2024NE000328'));
    expect(html).toContain('Vincular aos itens');
    expect(html).toContain('3 un do item 13');
    expect(html).toContain('vinc-empenhos-selecionar-2024NE000328');
    // A vinculada pela equipe fica no outro segmento.
    expect(html).not.toContain('vinc-empenhos-row-2024NE000337');
    expect(html).not.toContain('vinc-empenhos-row-2024NE000340');
    expect(html).not.toContain('Distribu');
    expect(html).toContain('Vinculadas pelo valor');
  });

  it('consulta não vê botões nem seleção', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'leitor' } as any);
    contratos(null);
    const html = render(<EmpenhosItensPage />);
    expect(html).toContain('2026NE000001');
    expect(html).not.toContain('vinc-empenhos-vincular-');
    expect(html).not.toContain('vinc-empenhos-selecionar-');
  });

  it('segmento "Vinculadas pela equipe" mostra quem vinculou', () => {
    const html = render(<EmpenhosItensPage />, '/?fila=EQUIPE');
    expect(html).toContain('vinc-empenhos-row-2024NE000337');
    expect(html).toContain('por Maria');
    expect(html).toContain('Editar o vínculo');
    expect(html).not.toContain('vinc-empenhos-row-2024NE000340');
  });

  it('segmento "Vinculadas pelo valor" mostra a regra e deixa desfazer', () => {
    const html = render(<EmpenhosItensPage />, '/?fila=VALOR');
    expect(html).toContain('vinc-empenhos-row-2024NE000340');
    expect(html).toContain('item 13');
    expect(html).toContain('Valor da nota = 3 × preço unitário do item 13.');
    expect(html).toContain('vinc-empenhos-nao-e-2024NE000340');
    expect(html).toContain('Editar o vínculo');
    expect(html).not.toContain('vinc-empenhos-row-2024NE000337');
    expect(html).not.toContain('vinc-empenhos-selecionar-');
  });

  it('a vincular: diz por que o SIAFI não resolveu a nota', () => {
    const comNota = { ...nota({ ne: '2025NE000015' }), notaSiafi: mapNotaSiafi({ motivo: 'QUANTIDADE_QUEBRADA', itens: [{ numero_item: 3, quantidade: 5.08, valor_unitario: 422.92, valor_total: 2150.08, no_contrato: true }], lido_em: '2026-10-14' }) };
    const semLeitura = { ...nota({ ne: '2025NE000016' }), notaSiafi: null };
    vi.mocked(useEmpenhosParaVincularAosItens).mockReturnValue({ data: [comNota, semLeitura], isLoading: false, isFetching: false, error: null, refetch: vi.fn() } as any);
    const html = render(<EmpenhosItensPage />);
    expect(html).toContain('SIAFI: a nota diz 5,08 un do item 3');
    expect(html).toContain('SIAFI: nota ainda não lida no SIAFI');
  });

  it('contrato encerrado: fora do padrão "Vigentes", com "Deixar como está" em "Encerrados"', () => {
    let html = render(<EmpenhosItensPage />);
    expect(html).not.toContain('2024NE000022');
    expect(html).toMatch(/A vincular<span class="segment-pill__count">2</);
    html = render(<EmpenhosItensPage />, '/?vigencia=ENCERRADOS');
    expect(html).toContain('2024NE000022');
    expect(html).toContain('contrato encerrado em 06/05/2025');
    expect(html).toContain('vinc-empenhos-deixar-2024NE000022');
    expect(html).not.toContain('vinc-empenhos-deixar-2024NE000328');
    expect(html).toMatch(/A vincular<span class="segment-pill__count">1</);
  });

  it('nota deixada como está: some de "Encerrados" e aparece em "Todos" com a justificativa e Reexibir', () => {
    deixadas(chaveAvisoDeixarNota('K3', '2024NE000022'));
    let html = render(<EmpenhosItensPage />, '/?vigencia=ENCERRADOS');
    expect(html).not.toContain('2024NE000022');
    html = render(<EmpenhosItensPage />, '/?vigencia=TODOS');
    expect(html).toContain('vinc-empenhos-deixada-2024NE000022');
    expect(html).toContain('Deixada como está');
    expect(html).toContain('João, 15/10/2026');
    expect(html).toContain('Contrato encerrado e pago; nada mais muda.');
    expect(html).toContain('vinc-empenhos-reexibir-2024NE000022');
    expect(html).not.toContain('vinc-empenhos-deixar-2024NE000022');
    // A vincular continua disponível; a nota não entra no lote.
    expect(html).toContain('vinc-empenhos-vincular-2024NE000022');
  });

  it('segmento "Conferir no Contratos.gov.br": notas do escopo, com a conferência e sem o lote', () => {
    const linha = (over: any) =>
      mapConferencia({
        contrato_empenho_id: over.ne, contract_key: 'K1', numero_oficial: over.ne, uasg_emitente: '200330', valor_nota: 36234,
        tipo: 'ITEM_FORA_DO_CONTRATO', itens_nota: [], itens_fora: [], outro_preco: [], parcelas: [], itens_contrato: [], situacao: 'A_CONFERIR', ...over
      });
    vi.mocked(useConferenciasDaNota).mockReturnValue({
      data: [
        linha({ ne: '2024NE000335' }),
        linha({ ne: '2026NE000218', tipo: 'ITEM_COM_OUTRO_PRECO', situacao: 'CORRIGINDO', correcao_id: 1, correcao_tipo: 'CORRIGIR_ITENS_DO_CONTRATO', correcao_por_nome: 'Maria', correcao_em: '2026-10-14T10:00:00Z' }),
        linha({ ne: '2026NE000999', contract_key: 'OUTRO' })
      ]
    } as any);
    const html = render(<EmpenhosItensPage />, '/?fila=CONFERIR');
    expect(html).toContain('Conferir no Contratos.gov.br');
    expect(html).toContain('vinc-nota-row-2024NE000335');
    expect(html).toContain('Item fora do contrato');
    expect(html).toContain('Corrigindo · Maria');
    expect(html).toContain('vinc-nota-desfazer-2026NE000218');
    expect(html).not.toContain('2026NE000999');
    expect(html).not.toContain('vinc-empenhos-selecionar-');
  });
});

const fora = (over: any) =>
  linhaForaDoContrato({
    id_fatura: 1490, contract_key: 'K1', fatura_numero: '1490', fatura_emissao: '2026-07-10', fatura_referencia: '07/2026', fatura_valor_liquido: 24500,
    id_empenho_gov: 'g412', numero_empenho: '2024NE000412', empenho_id: null, outros_contratos: [], homonimas: [], outras_notas_da_fatura: [],
    veredito: 'FORA_DOS_CONTRATOS', situacao: 'A_CONFERIR', ...over
  });

describe('Vínculos → Empenhos ao contrato', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor' } as any);
    contratos(new Set(['K1', 'K3']));
    deixadas();
    vi.mocked(useEmpenhosForaDoContrato).mockReturnValue({
      data: [
        fora({}),
        fora({ id_fatura: 1800, contract_key: 'K3', fatura_numero: '47257254', id_empenho_gov: 'g345', numero_empenho: '2024NE000345' }),
        fora({ id_fatura: 2231, contract_key: 'K2', fatura_numero: '2231', id_empenho_gov: 'g603', numero_empenho: '2025NE000603' }),
        fora({ id_fatura: 1500, id_empenho_gov: 'g700', numero_empenho: '2024NE000700', veredito: 'EM_OUTRO_CONTRATO', outros_contratos: ['200331-00004-2017'], situacao: 'CORRIGINDO', correcao_tipo: 'MUDAR_FATURA_DE_CONTRATO', correcao_por_nome: 'Maria', correcao_em: '2026-10-13T12:00:00Z' })
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn()
    } as any);
  });

  it('lista as notas a conferir do escopo do gestor, com o veredito e o botão Conferir, sem vincular à mão', () => {
    const html = render(<EmpenhosContratoPage />);
    expect(html).toContain('Empenhos citados fora do contrato');
    expect(html).toContain('2024NE000412');
    expect(html).toContain('Fora dos contratos');
    expect(html).toContain('vinc-ne-contrato-conferir-1490|g412');
    expect(html).not.toContain('Vincular ao contrato');
    // Fora do escopo do gestor não entra; a marcada fica no segmento "Corrigindo na fonte".
    expect(html).not.toContain('2025NE000603');
    expect(html).not.toContain('2024NE000700');
    expect(html).toMatch(/A conferir<span class="segment-pill__count">1</);
    expect(html).toMatch(/Corrigindo na fonte<span class="segment-pill__count">1</);
  });

  it('segmento "Corrigindo na fonte": quem marcou e o botão de desfazer para o gestor', () => {
    let html = render(<EmpenhosContratoPage />, '/?situacao=CORRIGINDO');
    expect(html).toContain('2024NE000700');
    expect(html).toContain('Corrigindo na fonte · Maria, 13/10/2026');
    expect(html).toContain('vinc-ne-contrato-desfazer-1500|g700');
    vi.mocked(useAuth).mockReturnValue({ role: 'leitor' } as any);
    contratos(null);
    html = render(<EmpenhosContratoPage />, '/?situacao=CORRIGINDO');
    expect(html).toContain('2024NE000700');
    expect(html).not.toContain('vinc-ne-contrato-desfazer');
  });

  it('a conferência tem as três partes; "Vou corrigir" só para quem pode marcar', () => {
    const l = fora({ veredito: 'EM_OUTRO_CONTRATO', outros_contratos: ['200331-00004-2017'] });
    let html = renderToStaticMarkup(<PainelDaConferencia linha={l} contrato={{ numero: '00088/2013' }} podeMarcar onVouCorrigir={vi.fn()} />);
    expect(html).toContain('O que aconteceu');
    expect(html).toContain('Esta nota está no contrato 00004/2017 e não neste.');
    expect(html).toContain('O que fazer no Contratos.gov.br');
    expect(html).toContain('inclua a nota também no 00088/2013.');
    expect(html).toContain('Vou corrigir no Contratos.gov.br');
    html = renderToStaticMarkup(<PainelDaConferencia linha={l} contrato={{ numero: '00088/2013' }} podeMarcar={false} onVouCorrigir={vi.fn()} />);
    expect(html).not.toContain('Vou corrigir no Contratos.gov.br');
    expect(html).toContain('Abrir o Contratos.gov.br');
  });

  it('contrato encerrado: fora do padrão "Vigentes"; em "Encerrados" tem "Deixar como está"; deixada só em "Todas"', () => {
    let html = render(<EmpenhosContratoPage />);
    expect(html).not.toContain('2024NE000345');
    expect(html).toMatch(/A conferir<span class="segment-pill__count">1</);
    html = render(<EmpenhosContratoPage />, '/?vigencia=ENCERRADOS');
    expect(html).toContain('2024NE000345');
    expect(html).toContain('contrato encerrado em 06/05/2025');
    expect(html).toContain('vinc-ne-contrato-deixar-1800|g345');
    expect(html).not.toContain('vinc-ne-contrato-deixar-1490|g412');
    deixadas(chaveAvisoDeixarFatura('K3', 1800, 'g345'));
    html = render(<EmpenhosContratoPage />, '/?vigencia=ENCERRADOS');
    expect(html).not.toContain('2024NE000345');
    html = render(<EmpenhosContratoPage />, '/?vigencia=TODOS&situacao=TODAS');
    expect(html).toContain('vinc-ne-contrato-deixada-1800|g345');
    expect(html).toContain('Deixada como está');
    expect(html).toContain('vinc-ne-contrato-reexibir-1800|g345');
    expect(html).toMatch(/A conferir<span class="segment-pill__count">1</);
    expect(html).toMatch(/Todas<span class="segment-pill__count">3</);
  });

  it('marca vencida volta para "A conferir" com o aviso de que a correção não chegou', () => {
    const l = fora({ situacao: 'CORRECAO_NAO_CHEGOU', correcao_tipo: 'OUTRO', correcao_por_nome: 'Maria', correcao_em: '2026-10-01T12:00:00Z' });
    const html = renderToStaticMarkup(<PainelDaConferencia linha={l} contrato={{ numero: '00002/2025' }} podeMarcar onVouCorrigir={vi.fn()} />);
    expect(html).toContain('a correção ainda não chegou');
    expect(html).toContain('Vou corrigir no Contratos.gov.br');
  });
});

describe('Alocação → Itens às unidades', () => {
  const linha = (over: any) => ({
    key: over.key,
    ataKey: '00021/2024-200331',
    arp: { numeroAtaRegistroPreco: '00021/2024', codigoUnidadeGerenciadora: '200331' },
    item: { numeroItem: over.numero, descricaoItem: over.desc },
    gestorNome: 'Maria',
    diasRestantes: 100,
    faixa: 'REGULAR',
    quantitativoSenasp: over.senasp,
    consumoPct: null,
    alocado: over.alocado,
    alocadoPorUnidade: over.un,
    nivelAlocacao: over.nivel,
    contratada: null,
    empenhado: 0,
    empenhosPendentes: 0,
    nivelEmpenho: 'SEM'
  });
  beforeEach(() => {
    vi.mocked(useAtasPortfolio).mockReturnValue({ arps: [{}], scopedArps: [], isLoading: false, scopeLoading: false, itemsByAta: {}, gestorByAta: {}, syncError: null, reload: vi.fn() } as any);
    vi.mocked(useCarteiraItens).mockReturnValue({
      rows: [
        linha({ key: 'a', numero: '00013', desc: 'Placa balística', senasp: 79, alocado: 0, un: {}, nivel: 'SEM' }),
        linha({ key: 'b', numero: '00043', desc: 'Capacete balístico', senasp: 342, alocado: 200, un: { dfnsp: 200 }, nivel: 'PARCIAL' }),
        linha({ key: 'c', numero: '00045', desc: 'Capacete lote 2', senasp: 35, alocado: 35, un: { dfnsp: 35 }, nivel: 'TOTAL' })
      ],
      unidades: [{ chave: 'dfnsp', nome: 'DFNSP' }],
      isLoading: false
    } as any);
  });

  it('abre agrupado por ata, com a ata fechada e o resumo de todos os itens', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor_saldos' } as any);
    const html = render(<ItensUnidadesPage />);
    expect(html).toContain('vinc-atas-row-00021/2024-200331');
    expect(html).toContain('1 item em 1 ata');
    expect(html).toContain('3 itens');
    expect(html).toContain('Parcialmente alocada');
    // Soma limitada ao quantitativo de cada item: 0 + 200 + 35 de 79 + 342 + 35.
    expect(html).toContain('235');
    expect(html).toContain('221 un');
    expect(html).not.toContain('Placa balística');
  });

  it('a busca por item já abre a ata mostrando o item e o link para os outros', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor_saldos' } as any);
    const html = render(<ItensUnidadesPage />, '/?busca=placa');
    expect(html).toContain('vinc-atas-itens-00021/2024-200331');
    expect(html).toContain('Placa balística');
    expect(html).not.toContain('Capacete balístico');
    expect(html).toContain('Mostrar os outros 2 itens da ata');
    expect(html).toContain('vinc-itens-alocar-a');
  });

  it('gestor de saldos abre em "Sem alocação" e aloca da linha', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor_saldos' } as any);
    const html = render(<ItensUnidadesPage />, '/?ver=ITEM');
    expect(html).toContain('Itens a alocar às unidades internas');
    expect(html).toContain('Placa balística');
    expect(html).not.toContain('Capacete balístico');
    expect(html).toContain('vinc-itens-alocar-a');
    expect(html).not.toContain('ainda sem unidade');
  });

  it('parcialmente alocados mostram o que falta e as unidades', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor_saldos' } as any);
    const html = render(<ItensUnidadesPage />, '/?alocacao=PARCIAL&ver=ITEM');
    expect(html).toContain('Capacete balístico');
    expect(html).toContain('142 un');
    expect(html).toContain('DFNSP 200');
  });

  it('gestor e consulta só acompanham: sem botão Alocar', () => {
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor' } as any);
    expect(render(<ItensUnidadesPage />, '/?ver=ITEM')).not.toContain('vinc-itens-alocar-');
    expect(render(<ItensUnidadesPage />, '/?busca=placa')).not.toContain('vinc-itens-alocar-');
  });
});

describe('Vínculos: uma leitura falha, a faixa avisa e o resto fica', () => {
  const falhou = (mensagem = 'canceling statement due to statement timeout') => ({ data: undefined, isError: true, error: new Error(mensagem), refetch: vi.fn() });
  const notas = () =>
    vi.mocked(useEmpenhosParaVincularAosItens).mockReturnValue({
      data: [nota({ ne: '2024NE000328', sugestao_tipo: 'MULTIPLO_DO_PRECO', sugestao: [{ numero_item: 13, quantidade: 3 }] })],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn()
    } as any);

  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ role: 'gestor' } as any);
    contratos(new Set(['K1', 'K3']));
    deixadas();
    vi.mocked(useConferenciasDaNota).mockReturnValue({ data: [] } as any);
  });

  it('Empenhos aos itens: as notas a conferir não carregaram → faixa; as notas a vincular ficam', () => {
    notas();
    vi.mocked(useConferenciasDaNota).mockReturnValue(falhou() as any);
    const html = render(<EmpenhosItensPage />);
    expect(html).toContain('data-testid="vinc-empenhos-fontes-com-falha"');
    expect(html).toContain('Parte da fila não carregou');
    expect(html).toContain('<strong>Notas a conferir no Contratos.gov.br</strong>');
    expect(html).toContain('2024NE000328');
    expect(html).toMatch(/A vincular<span class="segment-pill__count">1</);
    // No segmento da conferência, "não carregou" no lugar de "nenhuma nota pede conferência".
    const conferir = render(<EmpenhosItensPage />, '/?fila=CONFERIR');
    expect(conferir).toContain('data-testid="vinc-nota-nao-carregou"');
    expect(conferir).not.toContain('Nenhuma nota pede conferência');
  });

  it('Empenhos aos itens: as notas não carregaram → "não carregaram", e não "todas já estão vinculadas"', () => {
    vi.mocked(useEmpenhosParaVincularAosItens).mockReturnValue({ ...falhou(), isLoading: false, isFetching: false } as any);
    const html = render(<EmpenhosItensPage />);
    expect(html).toContain('<strong>Notas a vincular aos itens</strong>');
    expect(html).toContain('data-testid="vinc-empenhos-nao-carregou"');
    expect(html).not.toContain('Todas as notas dos contratos da sua carteira já estão vinculadas');
    expect(html).not.toContain('Erro ao carregar os empenhos');
  });

  it('Empenhos aos itens: as notas deixadas como estão não carregaram → a faixa avisa', () => {
    notas();
    vi.mocked(useAvisosResolvidos).mockReturnValue({
      porChave: new Map(),
      resolver: { mutateAsync: vi.fn() },
      reexibir: { mutate: vi.fn(), isPending: false },
      podeResolver: true,
      podeConcluirTarefas: true,
      consulta: falhou('Failed to fetch')
    } as any);
    const html = render(<EmpenhosItensPage />);
    expect(html).toContain('<strong>Avisos resolvidos e notas deixadas como estão</strong>');
    expect(html).toContain('sem conexão com o banco');
    expect(html).toContain('2024NE000328');
  });

  it('Empenhos ao contrato: as notas não carregaram → faixa e "não carregaram", sem travar a tela', () => {
    vi.mocked(useEmpenhosForaDoContrato).mockReturnValue({ ...falhou(), isLoading: false } as any);
    const html = render(<EmpenhosContratoPage />);
    expect(html).toContain('Empenhos citados fora do contrato');
    expect(html).toContain('data-testid="vinc-ne-contrato-fontes-com-falha"');
    expect(html).toContain('<strong>Notas citadas fora do contrato</strong>');
    expect(html).toContain('data-testid="vinc-ne-contrato-nao-carregou"');
    expect(html).not.toContain('Nenhuma fatura cita empenho fora do contrato');
    expect(html).not.toContain('Erro ao carregar as notas');
  });

  it('perfil gestor sem os contratos do recorte: a faixa lista os contratos e a fila diz que não carregou', () => {
    notas();
    vi.mocked(useContratosDoFinanceiro).mockReturnValue({
      contrato: (k: string) => ({ numero: k }),
      lista: [],
      escopo: new Set<string>(),
      showGestorFilter: false,
      isLoading: false,
      leituras: [{ rotulo: 'contratos da UASG 200331', query: falhou() }],
      contratosNaoCarregaram: true
    } as any);
    const html = render(<EmpenhosItensPage />);
    expect(html).toContain('<strong>Contratos da UASG 200331</strong>');
    expect(html).toContain('data-testid="vinc-empenhos-nao-carregou"');
    expect(html).not.toContain('Todas as notas dos contratos da sua carteira já estão vinculadas');
  });

  it('tudo carregou: sem faixa', () => {
    notas();
    expect(render(<EmpenhosItensPage />)).not.toContain('fontes-com-falha');
  });
});
