import { describe, it, expect } from 'vitest';
import { entregaDoItem, entregaDoPedido } from '../emendasEntrega';
import { avisosDoPedido } from '../emendasPedidos';
import type { EntregaDaLinha } from '../../services/fiscalizacaoService';
import type { ItemCaep, LinhaPedido, NotaDaLinha, PedidoEmenda } from '../../services/emendasService';

const HOJE = '2026-10-29';
const A = '00031/2025-200331';
const B = '00048/2025-200331';
const item = (itemKey: string, numeroAta: string, nomeCurto: string): ItemCaep => ({
  itemKey,
  numeroAta,
  codigoUasg: '200331',
  numeroItem: '00001',
  descricao: nomeCurto,
  codigoPdm: 1,
  valorUnitario: 100,
  vigenciaFinal: '2026-12-18',
  ataEncerrada: false,
  alocado: 100,
  nomeCurto
});
const itens = new Map<string, ItemCaep>([
  [`${A}-00001`, item(`${A}-00001`, '00031/2025', 'Carabina')],
  [`${B}-00001`, item(`${B}-00001`, '00048/2025', 'Mira')]
]);
const linha = (id: string, extra: Partial<LinhaPedido> = {}): LinhaPedido => ({
  id,
  ordem: 1,
  tipo: 'ITEM',
  itemKey: `${A}-00001`,
  kitId: null,
  kitNome: null,
  kitVersao: null,
  kitComposicao: null,
  quantidade: 2,
  beneficiarioId: 'b1',
  cancelada: false,
  canceladaMotivo: null,
  empenhoDocumentoSei: null,
  contratoNumero: null,
  despachoDocumentoSei: null,
  ccgaSituacao: null,
  ...extra
});
const pedido = (extra: Partial<PedidoEmenda>): PedidoEmenda => ({
  id: 'p',
  numero: 1,
  autorId: 'A1',
  etapa: 'CONTRATACAO',
  origem: 'SISTEMA',
  observacao: null,
  contatoNome: null,
  contatoTelefone: null,
  contatoEmail: null,
  reservadoEm: '2026-09-02',
  minutaEm: '2026-09-04',
  minutaDocumentoSei: null,
  oficioNumero: null,
  oficioDocumentoSei: null,
  oficioProcessoSei: null,
  oficioEm: '2026-09-16',
  divergencia: null,
  devolvidoEm: null,
  siopEmenda: '31050007',
  siopEmendaAno: 2026,
  siopValor: null,
  siopGnd: null,
  conferidoEm: '2026-09-19',
  solicitadoEm: '2026-09-30',
  solicitadoDocumentoSei: '41388210',
  autorizadoEm: '2026-10-14',
  autorizadoDocumentoSei: null,
  cgofiEm: '2026-10-15',
  cgofiDocumentoSei: '41730551',
  empenhadoEm: '2026-10-20',
  empenhadoDocumentosSei: ['41225409'],
  contratacaoEm: '2026-10-22',
  contratacaoDocumentosSei: [],
  canceladoEm: null,
  canceladoMotivo: null,
  versao: 1,
  atualizadoPorNome: null,
  atualizadoEm: null,
  linhas: [linha('l1')],
  devolucoes: [],
  documentos: [],
  pedidoOrigemId: null,
  pedidoOrigemNome: null,
  anulacoes: [],
  emendaId: null,
  outrasEmendas: [],
  ...extra
});
const nota = (linhaId: string, extra: Partial<NotaDaLinha> = {}): NotaDaLinha => ({
  linhaId,
  nota: '2026NE000103',
  regra: 'SEI',
  motivo: null,
  contractKey: null,
  empenhoId: 'e1',
  valorEmpenhado: 200,
  valorLiquidado: 0,
  valorPago: 0,
  entregaPrevista: null,
  entregaPrevistaValor: null,
  emitidaEm: '2026-10-18',
  atualizadoEm: null,
  ...extra
});
const CONTRATO = '200331|2026|00041';

// Entrega da Fiscalização ligada à linha (fisc_entregas_das_emendas, migration 310).
const ent = (linhaId: string, etapa: string, extra: Partial<EntregaDaLinha> = {}): EntregaDaLinha => ({
  id: `${linhaId}-${etapa}`,
  linhaId,
  contractKey: CONTRATO,
  quantidade: 2,
  responsavel: 'SFC',
  etapa: etapa as EntregaDaLinha['etapa'],
  etapaEm: '2026-10-20',
  prevista: null,
  entregueEm: null,
  divididaDe: null,
  fiscalNome: null,
  ...extra
});
const contratadas = (ids: string[], extra: Partial<NotaDaLinha> = {}) => new Map(ids.map((id) => [id, nota(id, { contractKey: CONTRATO, ...extra })]));

describe('Entrega do pedido (protótipo aprovado em 13/11/2026)', () => {
  const p = pedido({ linhas: [linha('a'), linha('b')] });

  it('antes do contrato não há entrega', () => {
    expect(entregaDoPedido(p, new Map([['a', nota('a')], ['b', nota('b')]]), new Map(), HOJE)).toBeNull();
  });

  it('o pedido fica no passo do item mais atrasado, contado em itens', () => {
    const e = entregaDoPedido(p, contratadas(['a', 'b']), new Map([['a', [ent('a', 'TRD')]], ['b', [ent('b', 'PRODUCAO')]]]), HOJE)!;
    expect(e).toMatchObject({ passo: 'ENTREGUE_PARTE', rotulo: 'Entregue em parte', total: 2, entregues: 1, progresso: '1 de 2 itens entregues', pelaFiscalizacao: true });
    // Um item em produção e outro só com a Ordem: vale o mais atrasado.
    expect(entregaDoPedido(p, contratadas(['a', 'b']), new Map([['a', [ent('a', 'PRODUCAO')]], ['b', [ent('b', 'ORDEM')]]]), HOJE)!.rotulo).toBe('Ordem enviada');
  });

  it('prazo vencido e Exército viram avisos; todos no Exército, só a etiqueta', () => {
    const entregas = new Map([['a', [ent('a', 'ORDEM', { prevista: '2026-10-01' })]], ['b', [ent('b', 'CONTROLADO')]]]);
    const e = entregaDoPedido(p, contratadas(['a', 'b']), entregas, HOJE)!;
    expect(e).toMatchObject({ atrasados: 1, vencidaDesde: '2026-10-01', noExercito: 1 });
    expect(avisosDoPedido(p, itens, HOJE, contratadas(['a', 'b']), undefined, undefined, undefined, e).map((a) => a.tipo)).toEqual(expect.arrayContaining(['entregaAtrasada', 'noExercito']));
    const todos = entregaDoPedido(p, contratadas(['a', 'b']), new Map([['a', [ent('a', 'CONTROLADO')]], ['b', [ent('b', 'CONTROLADO')]]]), HOJE)!;
    expect(todos.rotulo).toBe('Aguardando o Exército');
    expect(avisosDoPedido(p, itens, HOJE, contratadas(['a', 'b']), undefined, undefined, undefined, todos).map((a) => a.tipo)).not.toContain('noExercito');
  });

  it('sem a Fiscalização, a etiqueta diz o que a nota mostra (D3)', () => {
    expect(entregaDoPedido(p, contratadas(['a', 'b'], { faturas: 1, faturadoEm: '2026-10-25' }), new Map(), HOJE)!).toMatchObject({ rotulo: 'Faturado', pelaFiscalizacao: false });
    expect(entregaDoPedido(p, contratadas(['a', 'b'], { valorLiquidado: 200 }), new Map(), HOJE)!.rotulo).toBe('Liquidado');
  });
});

describe('Entrega do item (aba Itens do Pedido 360)', () => {
  const p = pedido({ linhas: [linha('a', { quantidade: 10 })] });
  const l = linha('a', { quantidade: 10 });

  it('etapa e uma linha de detalhe, sem o contrato', () => {
    expect(entregaDoItem(p, l, contratadas(['a']), [ent('a', 'PRODUCAO', { quantidade: 10, prevista: '2026-12-08' })], HOJE)).toMatchObject({ rotulo: 'Em produção', detalhe: 'entrega prevista em 08/12/2026', atrasadaDesde: null });
    expect(entregaDoItem(p, l, contratadas(['a']), [ent('a', 'ENTREGUE', { quantidade: 4, entregueEm: '2026-10-25' }), ent('a', 'PRODUCAO', { quantidade: 6 })], HOJE)).toMatchObject({ rotulo: 'Entregue em parte', detalhe: '4 de 10 entregues' });
    expect(entregaDoItem(p, l, contratadas(['a']), [ent('a', 'ORDEM', { quantidade: 10, prevista: '2026-10-01' })], HOJE)!.atrasadaDesde).toBe('2026-10-01');
  });

  it('sem contrato, a célula segue com a situação de sempre', () => {
    expect(entregaDoItem(p, l, new Map([['a', nota('a')]]), [], HOJE)).toBeNull();
  });
});
