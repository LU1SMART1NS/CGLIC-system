import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { AutorEmenda, ContatoDaEmenda, EmendaSiop, ItemCaep, LinhaPedido, PedidoEmenda } from '../../../services/emendasService';

const item: ItemCaep = {
  itemKey: 'a', numeroAta: '00031/2025', codigoUasg: '200331', numeroItem: '00001', descricao: 'Viatura', codigoPdm: 1,
  valorUnitario: 100, vigenciaFinal: '2027-06-25', ataEncerrada: false, alocado: 100
};
const linha = (id: string, quantidade: number): LinhaPedido => ({
  id, ordem: 1, tipo: 'ITEM', itemKey: 'a', kitId: null, kitNome: null, kitVersao: null, kitComposicao: null,
  quantidade, beneficiarioId: null, cancelada: false, canceladaMotivo: null,
  empenhoDocumentoSei: null, contratoNumero: null, despachoDocumentoSei: null
});
const pedido = (id: string, autorId: string | null, etapa: PedidoEmenda['etapa'], quantidade: number): PedidoEmenda => ({
  id, numero: 1, autorId, etapa, origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-10-20',
  minutaEm: null, minutaDocumentoSei: null, oficioNumero: null, oficioDocumentoSei: null, oficioProcessoSei: null, oficioEm: null, divergencia: null, devolvidoEm: null, siopEmenda: null, siopEmendaAno: null,
  siopValor: null, siopGnd: null, conferidoEm: null, solicitadoEm: null, solicitadoDocumentoSei: null, autorizadoEm: null, autorizadoDocumentoSei: null, cgofiEm: null, cgofiDocumentoSei: null,
  empenhadoEm: null, empenhadoDocumentosSei: [], contratacaoEm: null, contratacaoDocumentosSei: [], canceladoEm: null,
  canceladoMotivo: null, versao: 1, atualizadoPorNome: null, atualizadoEm: null, linhas: [linha(`${id}-l`, quantidade)], devolucoes: [], documentos: [], pedidoOrigemId: null, pedidoOrigemNome: null, anulacoes: [], emendaId: null, outrasEmendas: []
});
const autor = (id: string, nome: string, tipo: AutorEmenda['tipo']): AutorEmenda => ({ id, nome, tipo, nomeCivil: null, partido: 'PX', uf: 'SP', emExercicio: true, legislatura: 57, lidoEm: null });

const COM_CONTATO = { ...pedido('p1', 'A1', 'OFICIO', 3), contatoNome: 'Maria da Assessoria', contatoTelefone: '61999990000', contatoEmail: 'maria@camara.leg.br' };
// p2 tem número (migration 217): 1/2026 do Deputado Um; p1 tem a emenda sem o ano (pedido da planilha antiga).
const PEDIDOS = [
  { ...COM_CONTATO, siopEmenda: '40140004' },
  { ...pedido('p2', 'A1', 'EMPENHADO', 2), numeroNoAno: 1, anoDoNumero: 2026, siopEmenda: '44050002', siopEmendaAno: 2026 },
  pedido('p3', 'A2', 'RESERVADO', 1),
  pedido('p4', null, 'RESERVADO', 4)
];
const ITENS: ItemCaep[] = [item];
const AUTORES = [autor('A1', 'Deputado Um', 'DEPUTADO'), autor('A2', 'Senadora Dois', 'SENADOR'), autor('A3', 'Bancada Três', 'BANCADA')];

const emendaSiop = (id: string, numero: string, vistaEm: string): EmendaSiop => ({
  id, ano: 2026, numero, autorId: 'A2', valor: 500_000, gnd: 'GND-4', beneficiarioId: null, objeto: null, vistaEm, observacao: null, versao: 1, criadoPorNome: null
});
const EMENDAS = [emendaSiop('e1', '42680021', '2026-10-10'), emendaSiop('e2', '42680022', '2026-10-20')];
const CONTATOS: ContatoDaEmenda[] = [
  { id: 'c1', emendaId: 'e2', contatoEm: '2026-10-21', comQuem: 'ASPAR · PM · SP', meio: 'WHATSAPP', resumo: 'vão mandar os itens', criadoPorNome: null, criadoEm: '2026-10-21T12:00:00Z' }
];

const perfil = vi.hoisted(() => ({ gerir: true }));

vi.mock('../../../hooks/useEmendas', () => ({
  hojeEmBrasilia: () => '2026-10-23',
  usePedidosEmendas: () => ({ data: PEDIDOS, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn(), dataUpdatedAt: 0 }),
  useNotasDasLinhas: () => ({ data: new Map() }),
  useDiferencasDeEmpenho: () => ({ conferencia: [], diferencas: new Map(), porItem: new Map(), resolvidos: new Set<string>() }),
  useCredorDiferente: () => ({ porPedido: new Map(), todosPorPedido: new Map(), resolvidos: new Set<string>() }),
  useItensCaep: () => ({ data: ITENS, isLoading: false }),
  useAutoresEmendas: () => ({ data: AUTORES }),
  useBeneficiariosEmendas: () => ({ data: [] }),
  useKitsEmendas: () => ({ data: [] }),
  usePodeGerirEmendas: () => perfil.gerir,
  usePodeVerContratos: () => false,
  useEmendasSiop: () => ({ data: EMENDAS, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useContatosDasEmendas: () => ({ data: CONTATOS }),
  useAsparDosOrgaos: () => ({ data: [] }),
  useApagarEmendaSiop: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useExecucaoEmendas: () => ({ data: [] }),
  useRemoverEmendaDoPedido: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useLigarEmendaAoPedido: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useNotasSemPedido: () => ({ data: [] })
}));
vi.mock('../PedidoModal', () => ({ PedidoModal: () => null }));
vi.mock('../../../hooks/useEmendasQuadro', () => ({ usePrecosParaEmenda: () => ({ precos: undefined, ipca: null, semPrevisao: false }) }));
vi.mock('../EtapaPedidoModal', () => ({ EtapaPedidoModal: () => null }));

import { EmendasPedidosPage } from '../EmendasPedidosPage';

const render = (url: string) => renderToStaticMarkup(<MemoryRouter initialEntries={[url]}>{<EmendasPedidosPage />}</MemoryRouter>);

describe('Pedidos: ver por pedido ou por emenda', () => {
  it('por pedido (padrão): lista os pedidos com o filtro de autor', () => {
    const html = render('/');
    expect(html).toContain('emendas-pedidos-tabela');
    expect(html).not.toContain('emendas-por-autor-tabela');
    expect(html).toContain('emendas-pedidos-filtro-autor');
  });

  it('?autor= deixa só os pedidos daquele autor; a-definir são as reservas sem parlamentar', () => {
    expect(render('/?autor=A2')).toContain('1 de 4 pedidos');
    expect(render('/?autor=a-definir')).toContain('1 de 4 pedidos');
  });

  it('?ver=autor virou a aba Parlamentares: a lista não aparece e o endereço vai para lá', () => {
    const html = render('/?ver=autor');
    expect(html).not.toContain('emendas-pedidos-tabela');
    expect(html).not.toContain('emendas-por-autor-tabela');
  });

  it('o seletor de visão tem só Por pedido e Por emenda', () => {
    const html = render('/');
    expect(html).toContain('Por pedido');
    expect(html).toContain('Por emenda');
    expect(html).not.toContain('Por parlamentar');
  });

  it('abas por fase; ?etapa= abre a fase com o filtro da etapa', () => {
    const html = render('/?etapa=RESERVADO');
    for (const fase of ['Interlocução', 'Empenho', 'Contratação', 'Todos', 'Cancelados']) expect(html).toContain(`>${fase}<`);
    expect(html).not.toContain('>Minuta<');
    expect(html).toContain('emendas-pedidos-filtro-etapa');
    // Itens reservados: p3 e p4 (p1 está no ofício).
    expect(html).toContain('2 de 3 pedidos');
    expect(render('/')).not.toContain('emendas-pedidos-filtro-etapa');
  });
});

describe('Pedidos: por emenda e a faixa das emendas sem pedido', () => {
  it('?ver=emenda: emendas vistas no SIOP sem pedido, a mais antiga sem contato urgente (decisão de 26/10/2026)', () => {
    perfil.gerir = true;
    const html = render('/?ver=emenda&situacao=sem');
    expect(html).toContain('emendas-por-emenda-tabela');
    expect(html).not.toContain('emendas-pedidos-tabela');
    expect(html).toContain('Registrar emenda do SIOP');
    expect(html).toContain('4268 0021');
    expect(html).toContain('Sem pedido · sem contato');
    expect(html).toContain('13 dias sem contato');
    expect(html).toContain('Sem pedido · em conversa');
    expect(html).toContain('ASPAR · PM · SP');
  });

  it('?ver=emenda para a consulta: sem o botão de registrar e sem a coluna dos contatos', () => {
    perfil.gerir = false;
    const html = render('/?ver=emenda');
    expect(html).toContain('4268 0021');
    expect(html).not.toContain('Registrar emenda do SIOP');
    expect(html).not.toContain('Último contato');
    perfil.gerir = true;
  });

  it('?ver=emenda: sem a coluna da data de registro (decisão de 26/10/2026), cabeçalho que ordena e sem a faixa vermelha na linha', () => {
    perfil.gerir = true;
    const html = render('/?ver=emenda');
    expect(html).not.toContain('Registrada em');
    expect(html).not.toContain('Vista no SIOP');
    expect(html).not.toContain('pelo pedido');
    expect(html).not.toContain('inset 3px 0 0');
    expect(html).toContain('aria-sort');
  });

  it('?ver=emenda abre em Todas, como as outras telas; ?situacao=com mostra a coluna Pedidos', () => {
    perfil.gerir = true;
    const marcado = (html: string, id: string) => new RegExp(`aria-pressed="true"[^>]*data-testid="emendas-por-emenda-situacao-${id}"`).test(html);
    const html = render('/?ver=emenda');
    expect(marcado(html, 'todas')).toBe(true);
    expect(marcado(html, 'sem')).toBe(false);
    expect(marcado(render('/?ver=emenda&situacao=sem'), 'sem')).toBe(true);
    const comPedido = render('/?ver=emenda&situacao=com');
    expect(comPedido).not.toContain('Registrada em');
    expect(comPedido).not.toContain('Último contato');
  });

  it('por pedido: faixa acima do trilho com as emendas sem pedido, fora da contagem das fases (decisão de 26/10/2026)', () => {
    perfil.gerir = true;
    const html = render('/');
    expect(html).toContain('emendas-pedidos-faixa-sem-pedido');
    expect(html).toContain('2 emendas indicadas no SIOP ainda sem pedido');
    expect(html).toContain('1 sem contato há 7 dias ou mais');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Ver emendas');
    expect(render('/?ver=emenda')).not.toContain('emendas-pedidos-faixa-sem-pedido');
  });

  it('faixa para a consulta: sem a urgência, que depende dos contatos que ela não lê', () => {
    perfil.gerir = false;
    const html = render('/');
    expect(html).toContain('2 emendas indicadas no SIOP ainda sem pedido');
    expect(html).not.toContain('sem contato há');
    perfil.gerir = true;
  });
});

describe('Pedidos: lista plana que abre o Pedido 360 (protótipo aprovado em 27/10/2026)', () => {
  it('a coluna Pedido mostra o número no parlamentar; sem emenda é reserva; com a emenda sem o ano, "ano a informar"', () => {
    const html = render('/');
    expect(html).toContain('>1/2026<');
    expect(html).toContain('>Reserva<');
    expect(html).toContain('de 20/10/2026');
    expect(html).toContain('Emenda 4014 0004');
    expect(html).toContain('ano a informar');
  });

  it('a linha não abre mais o pedido embaixo: sem o detalhe nem os botões das etapas', () => {
    const html = render('/');
    expect(html).not.toContain('emendas-pedido-detalhe-');
    expect(html).not.toContain('emendas-pedido-proximo-');
    expect(html).not.toContain('emendas-pedidos-so-este');
  });

  it('endereço antigo (?pedido=): não mostra a lista, vai para o Pedido 360', () => {
    expect(render('/?pedido=p2')).not.toContain('emendas-pedidos-tabela');
  });
});
