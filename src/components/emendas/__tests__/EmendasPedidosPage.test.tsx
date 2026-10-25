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
  quantidade, beneficiarioId: null, cancelada: false, canceladaMotivo: null,
  empenhoDocumentoSei: null, contratoNumero: null, despachoDocumentoSei: null
});
const pedido = (id: string, autorId: string | null, etapa: PedidoEmenda['etapa'], quantidade: number): PedidoEmenda => ({
  id, numero: 1, autorId, etapa, origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-10-20',
  minutaEm: null, minutaDocumentoSei: null, oficioNumero: null, oficioDocumentoSei: null, oficioProcessoSei: null, oficioEm: null, divergencia: null, devolvidoEm: null, siopEmenda: null, siopEmendaAno: null,
  siopValor: null, siopGnd: null, conferidoEm: null, solicitadoEm: null, solicitadoDocumentoSei: null, autorizadoEm: null, autorizadoDocumentoSei: null, cgofiEm: null, cgofiDocumentoSei: null,
  empenhadoEm: null, empenhadoDocumentosSei: [], contratacaoEm: null, contratacaoDocumentosSei: [], canceladoEm: null,
  canceladoMotivo: null, versao: 1, atualizadoPorNome: null, atualizadoEm: null, linhas: [linha(`${id}-l`, quantidade)], devolucoes: [], documentos: []
});
const autor = (id: string, nome: string, tipo: AutorEmenda['tipo']): AutorEmenda => ({ id, nome, tipo, nomeCivil: null, partido: 'PX', uf: 'SP', emExercicio: true, legislatura: 57, lidoEm: null });

const PEDIDOS = [pedido('p1', 'A1', 'OFICIO', 3), pedido('p2', 'A1', 'EMPENHADO', 2), pedido('p3', 'A2', 'RESERVADO', 1), pedido('p4', null, 'RESERVADO', 4)];
const ITENS: ItemCaep[] = [item];
const AUTORES = [autor('A1', 'Deputado Um', 'DEPUTADO'), autor('A2', 'Senadora Dois', 'SENADOR'), autor('A3', 'Bancada Três', 'BANCADA')];

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
  usePodeGerirEmendas: () => true,
  usePodeVerContratos: () => false
}));
vi.mock('../PedidoModal', () => ({ PedidoModal: () => null }));
vi.mock('../../../hooks/useEmendasQuadro', () => ({ usePrecosParaEmenda: () => ({ precos: undefined, ipca: null, semPrevisao: false }) }));
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

  it('por autor respeita a fase escolhida e tira Já empenhado', () => {
    // ?etapa=RESERVADO abre a fase Interlocução (Reservado, Minuta e Ofício).
    const html = render('/?ver=autor&etapa=RESERVADO');
    expect(html).toContain('Valor nesta fase');
    expect(html).not.toContain('Já empenhado');
    expect(html).toContain('Senadora Dois');
    expect(html).toContain('Deputado Um');
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

describe('Pedidos: uma solicitação de empenho para cada ata (migration 178)', () => {
  beforeAll(() => {
    const A = '00031/2025-200331';
    const B = '00048/2025-200331';
    PEDIDOS.push({
      ...pedido('aut', 'A1', 'CGOFI', 1),
      solicitadoEm: '2026-09-23',
      autorizadoEm: '2026-09-24',
      cgofiEm: '2026-09-30',
      linhas: [
        { ...linha('aut-1', 8), itemKey: `${A}-00001` },
        { ...linha('aut-2', 3), itemKey: `${B}-00001` }
      ],
      documentos: [
        { id: '37098929', linhas: [], etapa: 'AUTORIZACAO', numero: '37098929', data: '2026-09-23', ataKey: A, assinadaEm: '2026-09-24' },
        { id: '37162877', linhas: [], etapa: 'CGOFI', numero: '37162877', data: '2026-09-29', ataKey: null, assinadaEm: null },
        { id: '37162892', linhas: [], etapa: 'CGOFI', numero: '37162892', data: '2026-09-30', ataKey: null, assinadaEm: null }
      ]
    });
  });

  it('a autorização lista as atas: a assinada com a data e a que falta com o botão para informar', () => {
    const html = render('/?pedido=aut');
    expect(html).toContain('1 de 2 atas');
    expect(html).toContain('emendas-etapa__contaatas--falta');
    expect(html).toContain('Ata 00031/2025');
    expect(html).toContain('assinada pela Diretora do FNSP em <strong>24/09/2026</strong>');
    expect(html).toContain('emendas-pedido-ata-mais-00031/2025');
    expect(html).toContain('emendas-pedido-ata-alterar-37098929');
    expect(html).toContain('Esta ata ainda não tem solicitação de empenho.');
    expect(html).toContain('emendas-pedido-ata-informar-00048/2025');
    expect(html).toContain('Informar a solicitação desta ata');
    // A solicitação é o mesmo documento: não se repete no passo "Empenho solicitado".
    expect(html).toContain('Uma solicitação para cada ata, nos blocos das atas ao lado');
  });

  it('cada documento da etapa traz a sua data; dias diferentes viram intervalo', () => {
    const html = render('/?pedido=aut');
    expect(html).toContain('37162877');
    expect(html).toContain('29/09/2026');
    expect(html).toContain('29/09 a 30/09/2026');
  });
});

describe('Pedidos: linhas tiradas', () => {
  beforeAll(() => {
    const motivo = 'Passou para o pedido 567 (reserva para o CBMERJ).';
    PEDIDOS.push({
      ...pedido('tiradas', 'A1', 'AUTORIZADO', 1),
      linhas: [linha('t-1', 1), { ...linha('t-2', 2), cancelada: true, canceladaMotivo: motivo }, { ...linha('t-3', 3), cancelada: true, canceladaMotivo: motivo }]
    });
  });

  it('o mesmo motivo de várias linhas aparece uma vez só', () => {
    const html = render('/?pedido=tiradas');
    expect(html).toContain('2 linhas tiradas do pedido');
    expect(html.split('Passou para o pedido 567').length - 1).toBe(1);
  });
});

describe('Pedidos: situação por linha, blocos por ata e O que falta (migration 180)', () => {
  const A = '00031/2025-200331';
  const B = '00048/2025-200331';
  beforeAll(() => {
    ITENS.push({ ...item, itemKey: `${A}-00001`, nomeCurto: 'Carabina', fornecedor: 'FORNECEDOR A' }, { ...item, itemKey: `${B}-00001`, numeroAta: '00048/2025', nomeCurto: 'Mira', fornecedor: 'FORNECEDOR B' });
    PEDIDOS.push({
      ...pedido('blocos', 'A1', 'AUTORIZADO', 1),
      oficioProcessoSei: '08027.000215/2026-81',
      solicitadoEm: '2026-09-23',
      autorizadoEm: '2026-09-24',
      linhas: [
        { ...linha('b-1', 8), itemKey: `${A}-00001` },
        { ...linha('b-2', 3), itemKey: `${A}-00001` },
        { ...linha('b-3', 5), itemKey: `${B}-00001` }
      ],
      documentos: [
        { id: 'd1', etapa: 'AUTORIZACAO', numero: '37098929', data: '2026-09-23', ataKey: A, assinadaEm: '2026-09-24', linhas: [{ linhaId: 'b-1', quantidade: 8 }] },
        { id: 'd2', etapa: 'AUTORIZACAO', numero: '37099000', data: '2026-10-01', ataKey: A, assinadaEm: null, linhas: [{ linhaId: 'b-2', quantidade: 3 }] },
        { id: 'd3', etapa: 'AUTORIZACAO', numero: '37104393', data: '2026-09-23', ataKey: B, assinadaEm: '2026-09-24', linhas: [] }
      ]
    });
  });

  it('as linhas ficam em blocos por ata, cada uma com a sua situação; com duas solicitações na ata, a linha diz qual a cobre', () => {
    const html = render('/?pedido=blocos');
    expect(html).toContain('emendas-pedido-ata-00031/2025');
    expect(html).toContain('emendas-pedido-ata-00048/2025');
    expect(html).toContain('emendas-pedido-abrir-atas-blocos');
    // b-1 autorizada, b-2 aguardando a assinatura (2ª rodada), b-3 autorizada pela solicitação única da ata B.
    expect(html).toMatch(/emendas-linha-situacao-b-1" data-situacao="AUTORIZADO"/);
    expect(html).toMatch(/emendas-linha-situacao-b-2" data-situacao="AGUARDANDO_ASSINATURA"/);
    expect(html).toMatch(/emendas-linha-situacao-b-3" data-situacao="AUTORIZADO"/);
    expect(html).toContain('solicitação 37099000');
    expect(html).toContain('2ª rodada');
    expect(html).toContain('cobre 1 de 2 linhas');
    // O resumo das linhas no quadro "onde está" e na lista.
    expect(html).toContain('emendas-pedido-resumo-linhas-blocos');
    expect(html).toContain('1 aguardando a assinatura · 2 autorizadas');
  });

  it('O que falta: a assinatura da solicitação com botão, o próximo passo e o beneficiário a informar', () => {
    const html = render('/?pedido=blocos');
    expect(html).toContain('emendas-pedido-falta-blocos');
    expect(html).toContain('Informar a assinatura da solicitação 37099000 · ata 00031/2025');
    expect(html).toContain('emendas-pedido-tarefa-ass-37099000');
    expect(html).toContain('Registrar o envio à CGOFI');
    expect(html).toContain('emendas-pedido-proximo-blocos');
    expect(html).toContain('Informar o beneficiário de 3 linhas');
    expect(html).toContain('emendas-pedidos-so-este');
  });

  it('vindo do Item 360 (?item=), as linhas daquele item ficam em destaque e o número do item é link para o Item 360', () => {
    const html = render(`/?pedido=blocos&item=${encodeURIComponent(`${A}-00001`)}`);
    expect(html.split('item de onde você veio').length - 1).toBeGreaterThanOrEqual(2);
    expect(html).toContain('emendas-item-link');
    expect(html).toContain('/atas/detalhe/00031%2F2025-200331/itens/00001?aba=emendas');
  });
});
