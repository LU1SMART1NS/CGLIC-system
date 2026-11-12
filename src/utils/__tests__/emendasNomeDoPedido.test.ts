import { describe, it, expect } from 'vitest';
import { faltaAnoDaEmenda, nomeDoPedido, numeroDoPedido, pedidoEmTexto, rotaDoPedido } from '../emendasNomeDoPedido';

const base = { id: 'uuid-1', autorId: '3166', numeroNoAno: null, anoDoNumero: null, siopEmenda: null, reservadoEm: '2026-09-02', origem: 'SISTEMA' as const };

describe('nome do pedido nas telas (migration 217): o sequencial do banco não aparece', () => {
  it('com número: "Pedido 1/2026", no meio da frase "pedido 1/2026", endereço pelo parlamentar, ano e ordem', () => {
    const p = { ...base, numeroNoAno: 1, anoDoNumero: 2026, siopEmenda: '31660008' };
    expect(numeroDoPedido(p)).toBe('1/2026');
    expect(nomeDoPedido(p)).toBe('Pedido 1/2026');
    expect(pedidoEmTexto(p)).toBe('pedido 1/2026');
    expect(rotaDoPedido(p)).toBe('/emendas/parlamentares/3166/pedidos/2026/1');
    expect(faltaAnoDaEmenda(p)).toBe(false);
  });

  it('antes da emenda é uma reserva, pela data; da planilha, sem data; endereço interno', () => {
    expect(nomeDoPedido(base)).toBe('Reserva de 02/09/2026');
    expect(pedidoEmTexto(base)).toBe('pedido reservado em 02/09/2026');
    expect(nomeDoPedido({ ...base, origem: 'PLANILHA' })).toBe('Reserva da planilha');
    expect(rotaDoPedido(base)).toBe('/emendas/pedidos/id/uuid-1');
  });

  it('com a emenda e sem o ano (planilha antiga): pela emenda, até a CAEP informar o ano', () => {
    const p = { ...base, siopEmenda: '40140004' };
    expect(numeroDoPedido(p)).toBeNull();
    expect(nomeDoPedido(p)).toBe('Pedido da emenda 4014 0004');
    expect(pedidoEmTexto(p)).toBe('pedido da emenda 4014 0004');
    expect(faltaAnoDaEmenda(p)).toBe(true);
  });

  it('sem parlamentar não há endereço pelo número, mesmo com número', () => {
    expect(rotaDoPedido({ ...base, autorId: null, numeroNoAno: 1, anoDoNumero: 2026 })).toBe('/emendas/pedidos/id/uuid-1');
  });
});
