import { describe, it, expect } from 'vitest';
import { execucaoDosPedidos, pagoPorParlamentar, pedidosDoParlamentar } from '../emendasParlamentar';
import type { LinhaPedido, NotaDaLinha, PedidoEmenda } from '../../services/emendasService';

const linha = (id: string, extra: Partial<LinhaPedido> = {}): LinhaPedido => ({
  id, ordem: 1, tipo: 'ITEM', itemKey: 'a', kitId: null, kitNome: null, kitVersao: null, kitComposicao: null, quantidade: 1, beneficiarioId: null,
  cancelada: false, canceladaMotivo: null, empenhoDocumentoSei: null, contratoNumero: null, despachoDocumentoSei: null, ...extra
});
const pedido = (id: string, autorId: string | null, extra: Partial<PedidoEmenda> = {}): PedidoEmenda => ({
  id, numero: 1, autorId, etapa: 'EMPENHADO', origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-10-20',
  minutaEm: null, minutaDocumentoSei: null, oficioNumero: null, oficioDocumentoSei: null, oficioProcessoSei: null, oficioEm: null, divergencia: null, devolvidoEm: null, siopEmenda: null, siopEmendaAno: null,
  siopValor: null, siopGnd: null, conferidoEm: null, solicitadoEm: null, solicitadoDocumentoSei: null, autorizadoEm: null, autorizadoDocumentoSei: null, cgofiEm: null, cgofiDocumentoSei: null,
  empenhadoEm: null, empenhadoDocumentosSei: [], contratacaoEm: null, contratacaoDocumentosSei: [], canceladoEm: null, canceladoMotivo: null, versao: 1, atualizadoPorNome: null, atualizadoEm: null,
  linhas: [], devolucoes: [], documentos: [], pedidoOrigemId: null, pedidoOrigemNome: null, anulacoes: [], emendaId: null, outrasEmendas: [], ...extra
});
const nota = (linhaId: string, empenhoId: string, emp: number, pago: number): NotaDaLinha => ({
  linhaId, nota: empenhoId, regra: 'SEI', motivo: null, contractKey: null, empenhoId, valorEmpenhado: emp, valorLiquidado: pago, valorPago: pago,
  entregaPrevista: null, entregaPrevistaValor: null, emitidaEm: null, atualizadoEm: null
});

describe('execução por parlamentar', () => {
  // A nota e1 paga linhas de dois pedidos do mesmo parlamentar: conta uma vez só.
  const p1 = pedido('p1', 'A1', { linhas: [linha('l1'), linha('l2')] });
  const p2 = pedido('p2', 'A1', { linhas: [linha('l3')] });
  const cancelado = pedido('p3', 'A1', { etapa: 'CANCELADO', linhas: [linha('l4')] });
  const notas = new Map([
    ['l1', nota('l1', 'e1', 300, 100)],
    ['l3', nota('l3', 'e1', 300, 100)],
    ['l2', nota('l2', 'e2', 50, 50)],
    ['l4', nota('l4', 'e3', 999, 999)]
  ]);

  it('cada nota conta uma vez e o pedido cancelado fica de fora', () => {
    expect(execucaoDosPedidos([p1, p2, cancelado], notas)).toEqual({ notas: 2, empenhado: 350, liquidado: 150, pago: 150 });
  });

  it('pago por parlamentar, sem as reservas sem parlamentar', () => {
    const m = pagoPorParlamentar([p1, p2, pedido('p5', null, { linhas: [linha('l9')] })], notas);
    expect([...m.keys()]).toEqual(['A1']);
    expect(m.get('A1')?.pago).toBe(150);
  });

  it('pedidos do parlamentar: as reservas (ainda sem número) primeiro; depois do mais novo ao mais antigo', () => {
    const ordem = pedidosDoParlamentar(
      [
        pedido('a', 'A1', { numeroNoAno: 1, anoDoNumero: 2026 }),
        pedido('b', 'A1', { numeroNoAno: 2, anoDoNumero: 2026 }),
        pedido('c', 'A1', { numeroNoAno: 1, anoDoNumero: 2024 }),
        pedido('d', 'A1'),
        pedido('e', 'A2', { numeroNoAno: 1, anoDoNumero: 2026 })
      ],
      'A1'
    ).map((p) => p.id);
    expect(ordem).toEqual(['d', 'b', 'a', 'c']);
  });
});
