import { beforeAll, describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { AutorEmenda, ItemCaep, LinhaPedido, PedidoEmenda } from '../../../services/emendasService';

const item: ItemCaep = {
  itemKey: 'a', numeroAta: '00031/2025', codigoUasg: '200331', numeroItem: '00001', descricao: 'Viatura', codigoPdm: 1,
  valorUnitario: 100, vigenciaFinal: '2027-06-25', ataEncerrada: false, alocado: 100
};
const linha = (id: string, quantidade: number): LinhaPedido => ({
  id, ordem: 1, tipo: 'ITEM', itemKey: 'a', kitId: null, kitNome: null, kitVersao: null, kitComposicao: null,
  quantidade, beneficiarioId: null, notaEmpenho: null, cancelada: false, canceladaMotivo: null,
  empenhoDocumentoSei: null, contratoNumero: null, despachoDocumentoSei: null, aConferir: null, planilhaRef: null
});
const pedido = (id: string, autorId: string | null, etapa: PedidoEmenda['etapa'], quantidade: number): PedidoEmenda => ({
  id, numero: 1, autorId, etapa, origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-10-20',
  minutaEm: null, minutaDocumentoSei: null, oficioNumero: null, oficioDocumentoSei: null, oficioProcessoSei: null, oficioEm: null, divergencia: null, devolvidoEm: null, siopEmenda: null,
  siopValor: null, siopGnd: null, conferidoEm: null, solicitadoEm: null, solicitadoDocumentoSei: null, autorizadoEm: null, autorizadoDocumentoSei: null, cgofiEm: null, cgofiDocumentoSei: null,
  empenhadoEm: null, empenhadoDocumentosSei: [], contratacaoEm: null, contratacaoDocumentosSei: [], canceladoEm: null,
  canceladoMotivo: null, versao: 1, atualizadoPorNome: null, atualizadoEm: null, linhas: [linha(`${id}-l`, quantidade)], devolucoes: []
});
const autor = (id: string, nome: string, tipo: AutorEmenda['tipo']): AutorEmenda => ({ id, nome, tipo, nomeCivil: null, partido: 'PX', uf: 'SP', emExercicio: true, legislatura: 57, lidoEm: null });

const PEDIDOS = [pedido('p1', 'A1', 'OFICIO', 3), pedido('p2', 'A1', 'EMPENHADO', 2), pedido('p3', 'A2', 'RESERVADO', 1), pedido('p4', null, 'RESERVADO', 4)];
const AUTORES = [autor('A1', 'Deputado Um', 'DEPUTADO'), autor('A2', 'Senadora Dois', 'SENADOR'), autor('A3', 'Bancada Três', 'BANCADA')];

vi.mock('../../../hooks/useEmendas', () => ({
  hojeEmBrasilia: () => '2026-10-23',
  usePedidosEmendas: () => ({ data: PEDIDOS, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn(), dataUpdatedAt: 0 }),
  useNotasDasLinhas: () => ({ data: new Map() }),
  useItensCaep: () => ({ data: [item], isLoading: false }),
  useAutoresEmendas: () => ({ data: AUTORES }),
  useBeneficiariosEmendas: () => ({ data: [] }),
  useKitsEmendas: () => ({ data: [] }),
  usePodeGerirEmendas: () => true,
  usePodeVerContratos: () => false
}));
vi.mock('../PedidoModal', () => ({ PedidoModal: () => null }));
vi.mock('../EtapaPedidoModal', () => ({ EtapaPedidoModal: () => null }));

import { EmendasPedidosPage } from '../EmendasPedidosPage';

const render = (url: string) => renderToStaticMarkup(<MemoryRouter initialEntries={[url]}>{<EmendasPedidosPage />}</MemoryRouter>);

describe('Pedidos: ver por pedido ou por autor', () => {
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

  it('?ver=autor soma os pedidos por autor; com Todos mostra Já empenhado', () => {
    const html = render('/?ver=autor');
    expect(html).toContain('emendas-por-autor-tabela');
    expect(html).not.toContain('emendas-pedidos-tabela');
    expect(html).toContain('Valor reservado');
    expect(html).toContain('Já empenhado');
    // A1 (2 pedidos, R$ 500), A2 e "Parlamentar a definir"; A3 não tem pedido
    expect(html).toContain('Deputado Um');
    expect(html).toContain('Parlamentar a definir');
    expect(html).not.toContain('Bancada Três');
  });

  it('por autor respeita a etapa escolhida e tira Já empenhado', () => {
    const html = render('/?ver=autor&etapa=RESERVADO');
    expect(html).toContain('Valor nesta etapa');
    expect(html).not.toContain('Já empenhado');
    expect(html).toContain('Senadora Dois');
    expect(html).not.toContain('Deputado Um');
  });
});

describe('Pedidos: linha do tempo com o SEI de cada etapa (migration 174)', () => {
  beforeAll(() => {
    PEDIDOS.push(
      {
        ...pedido('dev', 'A1', 'RESERVADO', 1),
        oficioProcessoSei: '08027.000226/2026-61',
        divergencia: 'valor diferente',
        devolvidoEm: '2026-10-20',
        devolucoes: [{ rodada: 1, minutaEm: '2026-09-10', oficioEm: '2026-09-25', oficioDocumentoSei: '40555666', oficioProcessoSei: '08027.000226/2026-61', motivo: 'valor diferente', devolvidoEm: '2026-10-20', criadoPorNome: null }]
      },
      { ...pedido('ccga', 'A2', 'CONTRATACAO', 1), solicitadoDocumentoSei: '41000001', cgofiDocumentoSei: '41000003', empenhadoDocumentosSei: ['41000004', '41000005'], contratacaoDocumentosSei: ['41000006'] }
    );
  });

  it('ofício devolvido: a próxima etapa é a 2ª minuta, com a tentativa anterior e o aviso', () => {
    const html = render('/?pedido=dev');
    expect(html).toContain('emendas-pedido-devolucoes-dev');
    expect(html).toContain('fazer a nova minuta');
    expect(html).toContain('2ª minuta');
    expect(html).toContain('Registrar a 2ª minuta');
    expect(html).toContain('40555666');
    expect(html).toContain('Ofício devolvido em 20/10/2026: valor diferente');
  });

  it('enviado à CCGA sem contrato: Interlocução e Empenho recolhidas, Contratação aberta aguardando o contrato', () => {
    const html = render('/?pedido=ccga');
    expect(html).toContain('etapa 9 de 10');
    expect(html).toContain('Aguardando a CCGA gerar o contrato');
    // Fases concluídas começam recolhidas: os SEI delas só aparecem ao abrir.
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('41000004');
    expect(html).toContain('41000006');
    expect(html).toContain('emendas-pedido-mais-sei-CONTRATACAO');
    expect(html).toContain('0 de 1 nota com contrato');
    expect(html).not.toContain('emendas-pedido-cancelar-ccga');
    expect(html).not.toContain('emendas-pedido-alterar-ccga');
  });

  it('em andamento: a fase atual aberta, com o botão da próxima ação no topo e o SEI com rótulo', () => {
    const html = render('/?pedido=p1');
    expect(html).toContain('etapa 3 de 10');
    expect(html).toContain('emendas-pedido-proximo-p1');
    expect(html).toContain('Conferir com o SIOP');
    expect(html).toContain('emendas-etapa--atual');
    expect(html).not.toContain('sem data na planilha');
  });
});
