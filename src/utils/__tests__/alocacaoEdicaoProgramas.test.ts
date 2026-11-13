import { describe, it, expect } from 'vitest';
import { avaliarEdicao, linhasIniciais, presoDaUnidade, reservasDosProgramasPorUnidade } from '../alocacaoEdicao';

describe('reservas de programas no mínimo da unidade (migration 297)', () => {
  const reservas = [
    { area: 'DGFNSP', quantidade: 200, contratado: 0 },
    { area: 'DGFNSP', quantidade: 150, contratado: 50 },
    { area: 'CAEP', quantidade: 100, contratado: 0 }
  ];
  it('soma por unidade: total e parte sem contrato', () => {
    const m = reservasDosProgramasPorUnidade(reservas);
    expect(m.get('dgfnsp')).toEqual({ total: 350, semContrato: 300 });
    expect(m.get('caep')).toEqual({ total: 100, semContrato: 100 });
  });
  it('mínimo = contratado + reservado sem contrato, nunca abaixo do total das reservas', () => {
    // 150 contratados fora dos programas + 50 ligados ao Manejo; reservas 350 (300 sem contrato).
    expect(presoDaUnidade({ contratado: 200, empenhado: 0, reservadoProgramas: 300, reservadoProgramasTotal: 350 })).toMatchObject({ preso: 500, motivo: 'contratado_e_reserva' });
    expect(presoDaUnidade({ contratado: 0, empenhado: 0, reservadoProgramas: 200, reservadoProgramasTotal: 200 }).explicacao).toBe('200 reservados a programas');
  });
  it('não deixa baixar a unidade abaixo das reservas nem removê-la', () => {
    const linhas = linhasIniciais([{ id: 'a', unitName: 'DGFNSP', allocatedQty: 700, empenhadaQty: 0 }], new Map(), new Map([['dgfnsp', 200]]), undefined, reservasDosProgramasPorUnidade(reservas));
    const abaixo = avaliarEdicao([{ ...linhas[0], qtd: 400 }], 1200);
    expect(abaixo.podeSalvar).toBe(false);
    expect(abaixo.erros.join(' ')).toContain('reduza antes a reserva do programa');
    const removida = avaliarEdicao([{ ...linhas[0], removida: true }], 1200);
    expect(removida.porLinha.get('a')!.podeRemover).toBe(false);
    expect(avaliarEdicao([{ ...linhas[0], qtd: 500 }], 1200).podeSalvar).toBe(true);
  });
});
