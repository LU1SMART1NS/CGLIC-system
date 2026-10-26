import { describe, expect, it } from 'vitest';
import { menorPrecoDisponivel, sobraDasEmendas, sobraPorAutor, type ExecucaoNoPortal } from '../emendasSobra';
import type { ItemCaep, LinhaPedido, NotaDaLinha, PedidoEmenda } from '../../services/emendasService';

const item = (k: string, valorUnitario: number, extra: Partial<ItemCaep> = {}): ItemCaep => ({
  itemKey: k, numeroAta: '00031/2025', codigoUasg: '200331', numeroItem: '00001', descricao: k, codigoPdm: 1, valorUnitario, vigenciaFinal: '2027-06-25', ataEncerrada: false, alocado: 100, ...extra
});
const itens = new Map([item('a', 1000), item('b', 19), item('c', 5, { ataEncerrada: true })].map((i) => [i.itemKey, i]));
const linha = (id: string, itemKey: string, quantidade: number): LinhaPedido => ({
  id, ordem: 1, tipo: 'ITEM', itemKey, kitId: null, kitNome: null, kitVersao: null, kitComposicao: null, quantidade, beneficiarioId: null, cancelada: false, canceladaMotivo: null,
  empenhoDocumentoSei: null, contratoNumero: null, despachoDocumentoSei: null
});
const pedido = (numero: number, etapa: PedidoEmenda['etapa'], linhas: LinhaPedido[], extra: Partial<PedidoEmenda> = {}): PedidoEmenda => ({
  id: `p${numero}`, numero, autorId: 'A1', etapa, origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-04-01',
  minutaEm: null, minutaDocumentoSei: null, oficioNumero: null, oficioDocumentoSei: null, oficioProcessoSei: null, oficioEm: null, divergencia: null, devolvidoEm: null,
  siopEmenda: '43600002', siopEmendaAno: 2026, siopValor: 10000, siopGnd: 'GND-4', conferidoEm: null, solicitadoEm: null, solicitadoDocumentoSei: null, autorizadoEm: null,
  autorizadoDocumentoSei: null, cgofiEm: null, cgofiDocumentoSei: null, empenhadoEm: null, empenhadoDocumentosSei: [], contratacaoEm: null, contratacaoDocumentosSei: [],
  canceladoEm: null, canceladoMotivo: null, versao: 1, atualizadoPorNome: null, atualizadoEm: null, linhas, devolucoes: [], documentos: [], pedidoOrigemId: null,
  pedidoOrigemNumero: null, anulacoes: [], emendaId: null, ...extra
});
const nota = (linhaId: string, n: string, valor: number): NotaDaLinha => ({
  linhaId, nota: n, regra: 'FORNECEDOR', motivo: null, contractKey: null, empenhoId: `e-${n}`, valorEmpenhado: valor, valorLiquidado: 0, valorPago: 0, entregaPrevista: null, entregaPrevistaValor: null, emitidaEm: null, atualizadoEm: null
});
const conta = (pedidos: PedidoEmenda[], notas: NotaDaLinha[], portal: ExecucaoNoPortal[] = [], minimo: number | null = 19) =>
  sobraDasEmendas({ pedidos, ano: 2026, itens, notas: new Map(notas.map((n) => [n.linhaId, n])), portal: new Map(portal.map((p) => [p.codigo, p])), minimo });

describe('sobra das emendas (migration 204)', () => {
  it('valor − empenhado das notas (cada nota uma vez) − em andamento', () => {
    const empenhado = pedido(1, 'CONTRATACAO', [linha('l1', 'a', 3), linha('l2', 'a', 2)]);
    const daSobra = pedido(2, 'RESERVADO', [linha('l3', 'a', 1)], { siopValor: null });
    const [e] = conta([empenhado, daSobra], [nota('l1', '2026NE000001', 5000), nota('l2', '2026NE000001', 5000)]);
    expect(e).toMatchObject({ codigo: '202643600002', valor: 10000, empenhado: 5000, emAndamento: 1000, sobra: 4000, fonteDoEmpenhado: 'NOTAS', situacao: 'sobra' });
    expect(e.pedidos.map((p) => p.numero)).toEqual([1, 2]);
  });

  const portal = (extra: Partial<ExecucaoNoPortal>): ExecucaoNoPortal => ({
    codigo: '202643600002', encontrada: true, valorEmpenhado: 50000, valorLiquidado: 0, valorPago: 0, lidoEm: null, notasSenasp: 2, empenhadoSenasp: 9990, notasSemValor: 0, ...extra
  });

  it('com as notas da SENASP lidas no Portal, vale o empenhado delas (não o da emenda inteira)', () => {
    const p = pedido(1, 'CONTRATACAO', [linha('l1', 'a', 3), linha('l2', 'a', 2)]);
    const [e] = conta([p], [nota('l1', '2026NE000001', 3000)], [portal({})]);
    expect(e).toMatchObject({ empenhado: 9990, fonteDoEmpenhado: 'PORTAL', sobra: 10, situacao: 'executada' });
  });

  it('nota da SENASP que o sistema ainda não tem: a confirmar', () => {
    const p = pedido(1, 'CONTRATACAO', [linha('l1', 'a', 3)]);
    expect(conta([p], [nota('l1', 'n', 3000)], [portal({ empenhadoSenasp: 3000, notasSemValor: 1 })])[0]).toMatchObject({ notasSemValor: 1, situacao: 'conferir' });
  });

  it('documentos ainda não lidos: usa as notas ligadas, não o empenhado da emenda inteira', () => {
    const p = pedido(1, 'CONTRATACAO', [linha('l1', 'a', 3)]);
    expect(conta([p], [nota('l1', 'n', 3000)], [portal({ notasSenasp: null, empenhadoSenasp: null })])[0]).toMatchObject({ empenhado: 3000, fonteDoEmpenhado: 'NOTAS' });
  });

  it('linha empenhada sem nota e sem o Portal: a confirmar; empenhado acima do valor: acima', () => {
    const p = pedido(1, 'CONTRATACAO', [linha('l1', 'a', 3), linha('l2', 'a', 2)]);
    expect(conta([p], [nota('l1', '2026NE000001', 3000)])[0]).toMatchObject({ linhasSemNota: 1, situacao: 'conferir' });
    expect(conta([p], [nota('l1', '2026NE000001', 12000), nota('l2', '2026NE000002', 1)])[0].situacao).toBe('acima');
  });

  it('só o ano pedido e sem os cancelados', () => {
    const antigo = pedido(1, 'CONTRATACAO', [], { siopEmendaAno: 2025 });
    const cancelado = pedido(2, 'CANCELADO', []);
    expect(conta([antigo, cancelado], [])).toEqual([]);
  });

  it('por autor soma só a sobra usável e fica com a pior situação', () => {
    const e1 = conta([pedido(1, 'CONTRATACAO', [linha('l1', 'a', 1)])], [nota('l1', 'n1', 4000)])[0];
    const e2 = { ...e1, codigo: 'x', situacao: 'conferir' as const, sobra: 999 };
    const a = sobraPorAutor([e1, e2]).get('A1')!;
    expect(a.sobra).toBe(6000);
    expect(a.situacao).toBe('conferir');
  });

  it('menor preço só de ata vigente com saldo livre', () => {
    expect(menorPrecoDisponivel(itens, new Map())).toBe(19);
    expect(menorPrecoDisponivel(itens, new Map([['b', 100]]))).toBe(1000);
  });
});
