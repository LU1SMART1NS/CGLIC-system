import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AutorEmenda, ContatoDaEmenda, EmendaSiop, ItemCaep, LinhaPedido, NotaDaLinha, PedidoEmenda } from '../../../services/emendasService';

const A = '00031/2025-200331';
const item: ItemCaep = { itemKey: `${A}-00001`, numeroAta: '00031/2025', codigoUasg: '200331', numeroItem: '00001', descricao: 'Carabina', codigoPdm: 1, valorUnitario: 100, vigenciaFinal: '2027-06-25', ataEncerrada: false, alocado: 100, nomeCurto: 'Carabina' };
const linha = (id: string, quantidade: number): LinhaPedido => ({
  id, ordem: 1, tipo: 'ITEM', itemKey: `${A}-00001`, kitId: null, kitNome: null, kitVersao: null, kitComposicao: null,
  quantidade, beneficiarioId: null, cancelada: false, canceladaMotivo: null, empenhoDocumentoSei: null, contratoNumero: null, despachoDocumentoSei: null
});
const pedido = (id: string, autorId: string | null, etapa: PedidoEmenda['etapa'], extra: Partial<PedidoEmenda> = {}): PedidoEmenda => ({
  id, numero: 900, numeroNoAno: null, anoDoNumero: null, autorId, etapa, origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-10-20',
  minutaEm: null, minutaDocumentoSei: null, oficioNumero: null, oficioDocumentoSei: null, oficioProcessoSei: null, oficioEm: null, divergencia: null, devolvidoEm: null, siopEmenda: null, siopEmendaAno: null,
  siopValor: null, siopGnd: null, conferidoEm: null, solicitadoEm: null, solicitadoDocumentoSei: null, autorizadoEm: null, autorizadoDocumentoSei: null, cgofiEm: null, cgofiDocumentoSei: null,
  empenhadoEm: null, empenhadoDocumentosSei: [], contratacaoEm: null, contratacaoDocumentosSei: [], canceladoEm: null,
  canceladoMotivo: null, versao: 1, atualizadoPorNome: null, atualizadoEm: null, linhas: [linha(`${id}-l`, 2)], devolucoes: [], documentos: [], pedidoOrigemId: null, pedidoOrigemNome: null, anulacoes: [], emendaId: null, outrasEmendas: [],
  ...extra
});
const autor = (id: string, nome: string, tipo: AutorEmenda['tipo'], uf: string): AutorEmenda => ({ id, nome, tipo, nomeCivil: null, partido: 'PX', uf, emExercicio: true, legislatura: 57, lidoEm: null });

// Deputado Um: um pedido empenhado (1/2026, emenda de R$ 1.000 com R$ 300 empenhados e R$ 100 pagos) e uma reserva.
const EMPENHADO = pedido('p1', 'A1', 'EMPENHADO', {
  numeroNoAno: 1, anoDoNumero: 2026, siopEmenda: '31660008', siopEmendaAno: 2026, siopValor: 1000, contatoNome: 'Maria da Assessoria', contatoTelefone: '61999990000',
  linhas: [linha('l1', 3)]
});
const RESERVA = pedido('p2', 'A1', 'RESERVADO');
const OUTRO = pedido('p3', 'A2', 'OFICIO');
const DO_ORGAO = pedido('p4', null, 'RESERVADO');
// Senadora Dois: emenda de 2024 (ano encerrado) de R$ 2.000 com R$ 500 empenhados: R$ 1.500 não empenhados.
const DE_2024 = pedido('p5', 'A2', 'CONTRATACAO', { siopEmenda: '40000001', siopEmendaAno: 2024, siopValor: 2000, linhas: [linha('l5', 1)] });
// Deputado Um em 2025: emenda só no pedido, sem o valor do SIOP (como a da Bancada MG).
const SEM_VALOR = pedido('p6', 'A1', 'AUTORIZADO', { numeroNoAno: 1, anoDoNumero: 2025, siopEmenda: '71140003', siopEmendaAno: 2025, linhas: [linha('l6', 2)] });
const PEDIDOS = [EMPENHADO, RESERVA, OUTRO, DO_ORGAO, DE_2024, SEM_VALOR];
const NOTAS = new Map<string, NotaDaLinha>([
  ['l5', { linhaId: 'l5', nota: '2024NE000007', regra: 'SEI', motivo: null, contractKey: null, empenhoId: 'e5', valorEmpenhado: 500, valorLiquidado: 0, valorPago: 0, entregaPrevista: null, entregaPrevistaValor: null, emitidaEm: '2024-06-01', atualizadoEm: null }],
  ['l1', { linhaId: 'l1', nota: '2026NE000103', regra: 'SEI', motivo: null, contractKey: null, empenhoId: 'e1', valorEmpenhado: 300, valorLiquidado: 150, valorPago: 100, entregaPrevista: null, entregaPrevistaValor: null, emitidaEm: '2026-04-17', atualizadoEm: null }]
]);
// Emenda registrada sem pedido do Deputado Um, com uma conversa.
const SEM_PEDIDO: EmendaSiop = { id: 'e2', ano: 2026, numero: '31660009', autorId: 'A1', valor: 500_000, gnd: 'GND-4', beneficiarioId: null, objeto: null, vistaEm: '2026-10-10', observacao: null, versao: 1, criadoPorNome: null };
const CONTATOS: ContatoDaEmenda[] = [{ id: 'c1', emendaId: 'e2', contatoEm: '2026-10-21', comQuem: 'ASPAR · PM · BA', meio: 'WHATSAPP', resumo: 'vão mandar os itens', criadoPorNome: null, criadoEm: '2026-10-21T12:00:00Z' }];

const perfil = vi.hoisted(() => ({ gerir: true }));

vi.mock('../../../hooks/useEmendas', () => ({
  hojeEmBrasilia: () => '2026-10-27',
  usePedidosEmendas: () => ({ data: PEDIDOS, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn(), dataUpdatedAt: 0 }),
  useNotasDasLinhas: () => ({ data: NOTAS }),
  useItensCaep: () => ({ data: [item], isLoading: false }),
  useAutoresEmendas: () => ({ data: [autor('A1', 'Deputado Um', 'DEPUTADO', 'BA'), autor('A2', 'Senadora Dois', 'SENADOR', 'SP'), autor('A3', 'Bancada Três', 'BANCADA', 'RJ')], isLoading: false }),
  useBeneficiariosEmendas: () => ({ data: [] }),
  useKitsEmendas: () => ({ data: [] }),
  useEmendasSiop: () => ({ data: [SEM_PEDIDO] }),
  useContatosDasEmendas: () => ({ data: CONTATOS }),
  useAsparDosOrgaos: () => ({ data: [] }),
  useExecucaoEmendas: () => ({ data: [] }),
  useDiferencasDeEmpenho: () => ({ conferencia: [], diferencas: new Map(), porItem: new Map(), resolvidos: new Set<string>() }),
  useCredorDiferente: () => ({ porPedido: new Map(), todosPorPedido: new Map(), resolvidos: new Set<string>() }),
  usePodeGerirEmendas: () => perfil.gerir,
  usePodeVerContratos: () => false,
  useApagarEmendaSiop: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useMapaGruposBeneficiarios: () => new Map()
}));
vi.mock('../../../hooks/useEmendasQuadro', () => ({ usePrecosParaEmenda: () => ({ precos: undefined, ipca: null, semPrevisao: false }) }));
vi.mock('../PedidoModal', () => ({ PedidoModal: () => null }));
vi.mock('../EmendaSiopModal', () => ({ EmendaSiopModal: () => null }));
vi.mock('../AsparModal', () => ({ AsparModal: () => null }));
vi.mock('../ContatoEmendaModal', () => ({ ContatoEmendaModal: () => null }));

import { EmendasParlamentaresPage } from '../parlamentares/EmendasParlamentaresPage';
import { Parlamentar360Page } from '../parlamentares/Parlamentar360Page';

const render = (url: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/emendas/parlamentares" element={<EmendasParlamentaresPage />} />
        <Route path="/emendas/parlamentares/:autorId" element={<Parlamentar360Page />} />
      </Routes>
    </MemoryRouter>
  );

describe('Emendas › Parlamentares (aba)', () => {
  it('uma linha por parlamentar com pedido, com a reserva sem parlamentar à parte; trilho por tipo', () => {
    const html = render('/emendas/parlamentares');
    expect(html).toContain('emendas-parlamentares-tabela');
    expect(html).toContain('Deputado Um');
    expect(html).toContain('Senadora Dois');
    expect(html).toContain('Parlamentar a definir');
    expect(html).not.toContain('Bancada Três');
    for (const t of ['Deputados', 'Senadores', 'Bancadas', 'Todos']) expect(html).toContain(`>${t}<`);
    expect(html).toContain('Emendas 2026');
    expect(html).toContain('emendas-sobra-faixa');
  });

  it('a Captação principal da antiga visão Por parlamentar continua aqui (migration 218)', () => {
    const html = render('/emendas/parlamentares');
    expect(html).toContain('Captação principal');
    expect(html).toContain('emendas-parlamentares-captacao-filter-gti');
  });

  it('a coluna Pago soma as notas dos pedidos do parlamentar', () => {
    const html = render('/emendas/parlamentares');
    expect(html).toContain('>Pago<');
    expect(html).toMatch(/R\$\s100,00/);
  });

  it('?tipo= fica no endereço; ?mostrar=todos traz quem não tem pedido', () => {
    expect(render('/emendas/parlamentares?tipo=SENADOR')).not.toContain('Deputado Um');
    expect(render('/emendas/parlamentares?mostrar=todos')).toContain('Bancada Três');
  });
});

describe('Parlamentar 360', () => {
  it('cartão: tipo, partido e UF, em exercício, indicadores e o código do autor', () => {
    const html = render('/emendas/parlamentares/A1');
    expect(html).toContain('Deputado Um');
    expect(html).toContain('Deputado federal · PX · BA · 57ª legislatura');
    expect(html).toContain('Em exercício');
    expect(html).toContain('parlamentar-360-emendas');
    expect(html).toContain('parlamentar-360-pago');
    expect(html).toMatch(/R\$\s100,00/);
    expect(html).toContain('Código do autor');
  });

  it('aba Emendas: a emenda do pedido com a sobra e a emenda sem pedido com os contatos', () => {
    const html = render('/emendas/parlamentares/A1');
    expect(html).toContain('Emenda 3166 0008 / 2026');
    expect(html).toContain('emendas-sobra-202631660008');
    expect(html).toContain('Emenda 3166 0009 / 2026');
    expect(html).toContain('vão mandar os itens');
  });

  it('aba Pedidos: o número no parlamentar, a reserva e o pago; a linha abre o Pedido 360', () => {
    const html = render('/emendas/parlamentares/A1?aba=pedidos');
    expect(html).toContain('parlamentar-360-pedidos');
    expect(html).toContain('>1/2026<');
    expect(html).toContain('>Reserva<');
  });

  it('contatos e nova reserva só para quem gere; a consulta não vê a aba Contatos', () => {
    const gestor = render('/emendas/parlamentares/A1');
    expect(gestor).toContain('parlamentar-360-nova-reserva');
    expect(gestor).toContain('Maria da Assessoria');
    expect(gestor).toContain('>Contatos<');
    perfil.gerir = false;
    try {
      const leitura = render('/emendas/parlamentares/A1');
      expect(leitura).not.toContain('parlamentar-360-nova-reserva');
      expect(leitura).not.toContain('Maria da Assessoria');
      expect(leitura).not.toContain('>Contatos<');
    } finally {
      perfil.gerir = true;
    }
  });

  it('aba Contatos: assessoria, ASPAR da UF e as conversas das emendas', () => {
    const html = render('/emendas/parlamentares/A1?aba=contatos');
    expect(html).toContain('parlamentar-360-assessoria');
    expect(html).toContain('ASPAR dos órgãos · BA');
    expect(html).toContain('parlamentar-360-conversas');
    expect(html).toContain('ASPAR · PM · BA');
  });

  it('código que não existe: parlamentar não encontrado', () => {
    expect(render('/emendas/parlamentares/X9')).toContain('Parlamentar não encontrado');
  });
});

describe('Ano da emenda (28/10/2026)', () => {
  it('Parlamentares abre no ano corrente; num ano encerrado a Sobra vira "Não empenhado"', () => {
    const corrente = render('/emendas/parlamentares');
    expect(corrente).toContain('emendas-parlamentares-ano-btn');
    expect(corrente).toContain('>Sobra<');
    const antigo = render('/emendas/parlamentares?ano=2024');
    expect(antigo).toContain('Emendas de 2024 (ano encerrado)');
    expect(antigo).toContain('>Não empenhado<');
    expect(antigo).toMatch(/R\$\s1\.500,00/);
    expect(antigo).toContain('Senadora Dois');
    expect(antigo).not.toContain('Deputado Um');
  });

  it('emenda sem valor do SIOP: "sem valor do SIOP" no lugar de R$ 0,00 e de "crédito perdido"', () => {
    const html = render('/emendas/parlamentares/A1?ano=2025');
    const cartao = (id: string) => html.match(new RegExp(`data-testid="parlamentar-360-${id}".*?</button>`))?.[0] ?? '';
    expect(cartao('emendas')).toContain('sem valor do SIOP');
    expect(cartao('sobra')).toContain('sem valor do SIOP');
    expect(cartao('sobra')).not.toContain('R$');
    expect(cartao('sobra')).not.toContain('crédito perdido');
    expect(cartao('empenhado')).not.toContain('R$');
  });

  it('Parlamentar 360 num ano encerrado: sem botão de pedido novo; o ano vem do endereço', () => {
    const html = render('/emendas/parlamentares/A2?ano=2024');
    expect(html).toContain('parlamentar-360-ano-btn');
    expect(html).toContain('Execução da emenda (2024, ano encerrado)');
    expect(html).toContain('perdeu o crédito');
    expect(html).not.toContain('emendas-sobra-novo-');
    expect(render('/emendas/parlamentares/A2')).not.toContain('Execução da emenda (2024');
  });
});
