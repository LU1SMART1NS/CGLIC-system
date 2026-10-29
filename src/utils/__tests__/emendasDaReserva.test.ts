import { describe, it, expect } from 'vitest';
import type { EmendaSiop, ItemCaep, LinhaPedido, PedidoEmenda } from '../../services/emendasService';
import { emendaSugerida, emendasParaAReserva, pedidoDaEmenda } from '../emendasDaReserva';

const MOTO = '00102/2024-200330-00002';
const itens = new Map<string, ItemCaep>([
  [MOTO, { itemKey: MOTO, numeroAta: '00102/2024', codigoUasg: '200330', numeroItem: '00002', descricao: MOTO, codigoPdm: null, valorUnitario: 40000, vigenciaFinal: '2027-06-30', ataEncerrada: false, alocado: 10 } as ItemCaep]
]);
const linha = (quantidade: number) => ({ id: `l${quantidade}`, ordem: 1, tipo: 'ITEM', itemKey: MOTO, kitId: null, quantidade, beneficiarioId: 'b1', cancelada: false }) as LinhaPedido;
const emenda = (id: string, numero: string, ano: number, valor: number | null, autorId = 'A'): EmendaSiop => ({ id, numero, ano, valor, autorId, gnd: null }) as EmendaSiop;
const pedido = (p: Partial<PedidoEmenda>): PedidoEmenda => ({ etapa: 'RESERVADO', oficioValor: null, emendaId: null, siopEmenda: null, siopEmendaAno: null, linhas: [linha(1)], ...p }) as PedidoEmenda;

describe('emenda na reserva (migration 243): o valor a indicar desconta os outros pedidos da emenda', () => {
  const e1 = emenda('e1', '41160011', 2026, 500000);
  const e2 = emenda('e2', '41160012', 2025, null);
  const outra = emenda('e3', '43020017', 2026, 400000, 'B');
  const pedidos = [
    pedido({ id: 'p1', emendaId: 'e1', oficioValor: 300000 }),
    pedido({ id: 'p2', siopEmenda: '41160011', siopEmendaAno: 2026, linhas: [linha(2)] }),
    pedido({ id: 'p3', emendaId: 'e1', etapa: 'CANCELADO', oficioValor: 100000 }),
    pedido({ id: 'aberto', emendaId: 'e1', linhas: [linha(3)] })
  ];

  it('só as emendas do parlamentar, mais novas primeiro; ofício ou previsto dos outros pedidos; cancelado e o aberto não contam', () => {
    const lista = emendasParaAReserva({ autorId: 'A', pedidoId: 'aberto', emendas: [e2, outra, e1], pedidos, itens });
    expect(lista.map((x) => x.emenda.id)).toEqual(['e1', 'e2']);
    expect(lista[0]).toMatchObject({ usado: 380000, aIndicar: 120000 });
    expect(lista[0].outros.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(lista[1]).toMatchObject({ usado: 0, aIndicar: null });
  });

  it('sem parlamentar, nenhuma emenda', () => {
    expect(emendasParaAReserva({ autorId: null, pedidoId: null, emendas: [e1], pedidos, itens })).toEqual([]);
  });

  it('abre escolhida a única emenda com valor a indicar (ou sem valor); emenda já toda indicada não', () => {
    const uma = (aIndicar: number | null) => [{ emenda: e1, outros: [], usado: 0, aIndicar }];
    expect(emendaSugerida(uma(10))).toBe('e1');
    expect(emendaSugerida(uma(null))).toBe('e1');
    expect(emendaSugerida(uma(0))).toBeNull();
    expect(emendaSugerida([...uma(10), ...uma(10)])).toBeNull();
  });

  it('o pedido é da emenda pela ligação ou pelo nº e ano', () => {
    expect(pedidoDaEmenda({ emendaId: 'e1', siopEmenda: null, siopEmendaAno: null }, e1)).toBe(true);
    expect(pedidoDaEmenda({ emendaId: null, siopEmenda: '41160011', siopEmendaAno: 2026 }, e1)).toBe(true);
    expect(pedidoDaEmenda({ emendaId: null, siopEmenda: '41160011', siopEmendaAno: 2025 }, e1)).toBe(false);
  });
});
