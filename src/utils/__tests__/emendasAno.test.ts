import { describe, expect, it } from 'vitest';
import { ANO_SEM, ANO_TODOS, anoDoPedido, anoEmTexto, anoEncerrado, anosDaLista, lerAnoDaUrl, pedidoNoAno } from '../emendasAno';

const p = (siopEmenda: string | null, siopEmendaAno: number | null, reservadoEm = '2026-03-10') => ({ siopEmenda, siopEmendaAno, reservadoEm });

describe('ano da emenda nas telas de Emendas (28/10/2026)', () => {
  it('ano do pedido: o da emenda; nº sem ano = "sem"; reserva sem emenda = ano em que foi feita', () => {
    expect(anoDoPedido(p('71250002', 2024))).toBe(2024);
    expect(anoDoPedido(p('43950006', null))).toBe(ANO_SEM);
    expect(anoDoPedido(p(null, null, '2025-11-30'))).toBe(2025);
  });

  it('lê o endereço: ano, "sem", "todos" só onde a tela aceita; o resto volta ao corrente', () => {
    expect(lerAnoDaUrl(null, 2026, true)).toBe('2026');
    expect(lerAnoDaUrl('2024', 2026, false)).toBe('2024');
    expect(lerAnoDaUrl('sem', 2026, false)).toBe(ANO_SEM);
    expect(lerAnoDaUrl('todos', 2026, true)).toBe(ANO_TODOS);
    expect(lerAnoDaUrl('todos', 2026, false)).toBe('2026');
    expect(lerAnoDaUrl('abc', 2026, true)).toBe('2026');
  });

  it('filtra o pedido pelo ano escolhido', () => {
    expect(pedidoNoAno(p('71250002', 2024), '2024')).toBe(true);
    expect(pedidoNoAno(p('71250002', 2024), '2026')).toBe(false);
    expect(pedidoNoAno(p('43950006', null), ANO_SEM)).toBe(true);
    expect(pedidoNoAno(p('43950006', null), ANO_TODOS)).toBe(true);
  });

  it('lista o ano corrente e os anos que existem, do mais novo ao mais antigo, sem o "sem ano"', () => {
    expect(anosDaLista([2024, ANO_SEM, null, 2024, 2022], 2026)).toEqual([2026, 2024, 2022]);
  });

  it('ano encerrado e o ano em texto', () => {
    expect(anoEncerrado('2024', 2026)).toBe(true);
    expect(anoEncerrado('2026', 2026)).toBe(false);
    expect(anoEncerrado(ANO_TODOS, 2026)).toBe(false);
    expect(anoEmTexto('2024')).toBe('de 2024');
    expect(anoEmTexto(ANO_SEM)).toBe('sem o ano');
  });
});
