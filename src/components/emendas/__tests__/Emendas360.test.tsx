import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AutorEmenda, ContatoDaEmenda, EmendaSiop, ItemCaep, LinhaPedido, NotaDaLinha, NotaSemPedido, PedidoEmenda } from '../../../services/emendasService';

const A = '00031/2025-200331';
const item: ItemCaep = { itemKey: `${A}-00001`, numeroAta: '00031/2025', codigoUasg: '200331', numeroItem: '00001', descricao: 'Carabina', codigoPdm: 1, valorUnitario: 100, vigenciaFinal: '2027-06-25', ataEncerrada: false, alocado: 100, nomeCurto: 'Carabina', fornecedor: 'FORNECEDOR A' };
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
const emendaSiop = (id: string, numero: string, vistaEm: string, extra: Partial<EmendaSiop> = {}): EmendaSiop => ({
  id, ano: 2026, numero, autorId: 'A2', valor: 500_000, gnd: 'GND-4', beneficiarioId: null, objeto: null, vistaEm, observacao: null, versao: 1, criadoPorNome: null, ...extra
});

// Duas emendas sem pedido da Senadora Dois (uma sem contato há 13 dias, outra em conversa) e a emenda do pedido 1/2026 do
// Deputado Um, que só existe no pedido (conferida no SIOP), com R$ 300 empenhados e R$ 100 pagos.
const EMENDAS = [emendaSiop('e1', '42680021', '2026-10-10', { objeto: 'Viaturas para a PM', criadoPorNome: 'Luís' }), emendaSiop('e2', '42680022', '2026-10-20')];
const CONTATOS: ContatoDaEmenda[] = [
  { id: 'c1', emendaId: 'e2', contatoEm: '2026-10-21', comQuem: 'ASPAR · PM · SP', meio: 'WHATSAPP', resumo: 'vão mandar os itens', criadoPorNome: null, criadoEm: '2026-10-21T12:00:00Z' }
];
const COM_EMENDA = pedido('p1', 'A1', 'EMPENHADO', { numeroNoAno: 1, anoDoNumero: 2026, siopEmenda: '31660008', siopEmendaAno: 2026, siopValor: 1000, linhas: [linha('l1', 3)] });
const PEDIDOS = [COM_EMENDA, pedido('p2', 'A1', 'RESERVADO')];
const NOTAS = new Map<string, NotaDaLinha>([
  ['l1', { linhaId: 'l1', nota: '2026NE000103', regra: 'SEI', motivo: null, contractKey: null, empenhoId: 'e1', valorEmpenhado: 300, valorLiquidado: 150, valorPago: 100, entregaPrevista: null, entregaPrevistaValor: null, emitidaEm: '2026-04-17', atualizadoEm: null }]
]);
// Nota da mesma emenda que o sistema achou e não ligou a nenhum pedido.
const SEM_PEDIDO: NotaSemPedido[] = [
  { empenhoId: 'e9', nota: '2026NE000500', ug: '200330', dataEmissao: '2026-05-01', valorEmpenhado: 50, credorNome: 'OUTRO FORNECEDOR', planoInterno: null, emenda: '31660008', emendaAno: 2026, autoresDoCodigo: [], pedidosDoCodigo: [], pedidosProvaveis: [] }
];

const perfil = vi.hoisted(() => ({ gerir: true }));

vi.mock('../../../hooks/useEmendas', () => ({
  hojeEmBrasilia: () => '2026-10-23',
  usePedidosEmendas: () => ({ data: PEDIDOS, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn(), dataUpdatedAt: 0 }),
  useEmendasSiop: () => ({ data: EMENDAS, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useContatosDasEmendas: () => ({ data: CONTATOS }),
  useNotasDasLinhas: () => ({ data: NOTAS }),
  useNotasSemPedido: () => ({ data: SEM_PEDIDO }),
  useItensCaep: () => ({ data: [item], isLoading: false }),
  useAutoresEmendas: () => ({ data: [autor('A1', 'Deputado Um', 'DEPUTADO', 'BA'), autor('A2', 'Senadora Dois', 'SENADOR', 'SP')], isLoading: false }),
  useBeneficiariosEmendas: () => ({ data: [] }),
  useKitsEmendas: () => ({ data: [] }),
  useAsparDosOrgaos: () => ({ data: [] }),
  useExecucaoEmendas: () => ({ data: [{ codigo: '202631660008', encontrada: true, valorEmpenhado: 400, valorLiquidado: 150, valorPago: 100, lidoEm: '2026-10-22', notasSenasp: 2, empenhadoSenasp: 400, notasSemValor: 0 }] }),
  useDiferencasDeEmpenho: () => ({ conferencia: [], diferencas: new Map(), porItem: new Map(), resolvidos: new Set<string>() }),
  useCredorDiferente: () => ({ porPedido: new Map(), todosPorPedido: new Map(), resolvidos: new Set<string>() }),
  usePodeGerirEmendas: () => perfil.gerir,
  usePodeVerContratos: () => false,
  useMapaGruposBeneficiarios: () => new Map()
}));
vi.mock('../../../hooks/useEmendasQuadro', () => ({ usePrecosParaEmenda: () => ({ precos: undefined, ipca: null, semPrevisao: false }) }));
vi.mock('../PedidoModal', () => ({ PedidoModal: () => null }));
vi.mock('../EmendaSiopModal', () => ({ EmendaSiopModal: () => null }));
vi.mock('../AsparModal', () => ({ AsparModal: () => null }));
vi.mock('../ContatoEmendaModal', () => ({ ContatoEmendaModal: () => null }));

import { EmendasListaPage } from '../emendas360/EmendasListaPage';
import { Emenda360Page } from '../emendas360/Emenda360Page';
import { emendaDoEndereco, rotaDaEmenda } from '../emendas360/rotaDaEmenda';

const render = (url: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/emendas/emendas" element={<EmendasListaPage />} />
        <Route path="/emendas/emendas/:ano/:numero" element={<Emenda360Page />} />
      </Routes>
    </MemoryRouter>
  );

describe('Emendas › Emendas (aba)', () => {
  it('sem pedido: a mais antiga sem contato fica urgente; a outra em conversa, com o último contato', () => {
    perfil.gerir = true;
    const html = render('/emendas/emendas?situacao=sem');
    expect(html).toContain('emendas-por-emenda-tabela');
    expect(html).toContain('Registrar emenda do SIOP');
    expect(html).toContain('4268 0021');
    expect(html).toContain('Sem pedido · sem contato');
    expect(html).toContain('13 dias sem contato');
    expect(html).toContain('Sem pedido · em conversa');
    expect(html).toContain('ASPAR · PM · SP');
  });

  it('para a consulta: sem o botão de registrar e sem a coluna dos contatos', () => {
    perfil.gerir = false;
    try {
      const html = render('/emendas/emendas');
      expect(html).toContain('4268 0021');
      expect(html).not.toContain('Registrar emenda do SIOP');
      expect(html).not.toContain('Último contato');
    } finally {
      perfil.gerir = true;
    }
  });

  it('abre em Todas; a emenda que só existe no pedido entra com o empenhado, o pago e a sobra', () => {
    const marcado = (html: string, id: string) => new RegExp(`aria-pressed="true"[^>]*data-testid="emendas-por-emenda-situacao-${id}"`).test(html);
    const html = render('/emendas/emendas');
    expect(marcado(html, 'todas')).toBe(true);
    expect(html).toContain('3166 0008');
    expect(html).toMatch(/R\$\s100,00/);
    expect(html).toContain('Captação principal');
    expect(html).toContain('emendas-por-emenda-ano-btn');
    expect(html).not.toContain('Registrada em');
  });
});

describe('Emenda 360', () => {
  it('endereço pelo ano e o nº; sem ano, "sem-ano"', () => {
    expect(rotaDaEmenda({ ano: 2026, numero: '31660008' })).toBe('/emendas/emendas/2026/31660008');
    expect(rotaDaEmenda({ ano: null, numero: '40140004' })).toBe('/emendas/emendas/sem-ano/40140004');
    expect(emendaDoEndereco([{ ano: 2026, numero: '31660008' }, { ano: null, numero: '40140004' }], 'sem-ano', '40140004')?.ano).toBeNull();
    expect(emendaDoEndereco([{ ano: 2026, numero: '31660008' }], '2025', '31660008')).toBeUndefined();
  });

  it('emenda sem pedido: cartão com o parlamentar, o objeto e quem registrou; criar pedido e contatos para quem gere', () => {
    const html = render('/emendas/emendas/2026/42680021');
    expect(html).toContain('Emenda 4268 0021');
    expect(html).toContain('Senadora Dois');
    expect(html).toContain('Objeto no SIOP: Viaturas para a PM');
    expect(html).toContain('Registrada por');
    expect(html).toContain('emenda-360-criar-pedido');
    expect(html).toContain('emenda-360-sem-pedido');
    expect(html).toContain('>Contatos<');
  });

  it('emenda do pedido: pedidos da emenda e execução pelo Portal ao lado das notas, com a nota fora dos pedidos', () => {
    const pedidos = render('/emendas/emendas/2026/31660008');
    expect(pedidos).toContain('emenda-360-pedidos');
    expect(pedidos).toContain('>1/2026<');
    const execucao = render('/emendas/emendas/2026/31660008?aba=execucao');
    expect(execucao).toContain('emenda-360-portal');
    expect(execucao).toContain('emenda-360-notas-ligadas');
    expect(execucao).toContain('2026NE000103');
    expect(execucao).toContain('2026NE000500');
    expect(execucao).toContain('sem pedido ligado');
    expect(execucao).toContain('emenda-360-diferenca');
  });

  it('a consulta não vê a aba Contatos nem os botões', () => {
    perfil.gerir = false;
    try {
      const html = render('/emendas/emendas/2026/42680021');
      expect(html).not.toContain('>Contatos<');
      expect(html).not.toContain('emenda-360-criar-pedido');
    } finally {
      perfil.gerir = true;
    }
  });

  it('nº que não existe: emenda não encontrada', () => {
    expect(render('/emendas/emendas/2026/99999999')).toContain('Emenda não encontrada');
  });
});
