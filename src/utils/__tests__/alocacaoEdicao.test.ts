import { describe, it, expect } from 'vitest';
import { avaliarEdicao, folgaDasUnidades, linhasIniciais, listaParaGravar, presoDaUnidade, vinculosSemRemovidas, type LinhaAlocacao } from '../alocacaoEdicao';
import type { AllocationExecution } from '../allocationExecution';

const gravadas = [
  { id: 'a1', unitName: 'FNSP', allocatedQty: 180000, empenhadaQty: 0 },
  { id: 'a2', unitName: 'DIOPI', allocatedQty: 60000, empenhadaQty: 0 },
  { id: 'a3', unitName: 'CAEP', allocatedQty: 20000, empenhadaQty: 0 }
];
const exec = new Map<string, AllocationExecution>([
  ['a1', { empenhado: 122400, vinculados: 4 }],
  ['a2', { empenhado: 0, vinculados: 0 }],
  ['a3', { empenhado: 0, vinculados: 1 }]
]);
const TOTAL = 312200;
const iniciais = () => linhasIniciais(gravadas, exec);
const com = (ls: LinhaAlocacao[], id: string, m: Partial<LinhaAlocacao>) => ls.map((l) => (l.id === id ? { ...l, ...m } : l));

describe('alocacaoEdicao', () => {
  it('as linhas trazem empenhado e empenhos vinculados de cada unidade', () => {
    const ls = iniciais();
    expect(ls.map((l) => [l.unitName, l.qtd, l.empenhado, l.vinculados])).toEqual([
      ['FNSP', 180000, 122400, 4],
      ['DIOPI', 60000, 0, 0],
      ['CAEP', 20000, 0, 1]
    ]);
  });

  it('sem mudança não há o que salvar', () => {
    const a = avaliarEdicao(iniciais(), TOTAL);
    expect(a.totalAlocado).toBe(260000);
    expect(a.aAlocar).toBe(52200);
    expect(a.mudancas).toEqual([]);
    expect(a.podeSalvar).toBe(false);
  });

  it('editar, remover e acrescentar aparecem no resumo e podem ser salvos', () => {
    let ls = com(iniciais(), 'a2', { removida: true });
    ls = com(ls, 'a3', { qtd: 50000 });
    ls = [...ls, { id: 'n1', unitName: 'DPSP', original: 0, qtd: 10000, empenhado: 0, contratado: 0, vinculados: 0, removida: false, adicionada: true }];
    const a = avaliarEdicao(ls, TOTAL);
    expect(a.mudancas).toEqual(['− DIOPI', 'CAEP 20.000 → 50.000', '+ DPSP 10.000']);
    expect(a.porLinha.get('a3')?.alterada).toBe(true);
    expect(a.podeSalvar).toBe(true);
    expect(listaParaGravar(ls, gravadas)).toEqual([
      { id: 'a1', unitName: 'FNSP', allocatedQty: 180000, empenhadaQty: 0 },
      { id: 'a3', unitName: 'CAEP', allocatedQty: 50000, empenhadaQty: 0 },
      { id: 'n1', unitName: 'DPSP', allocatedQty: 10000, empenhadaQty: 0 }
    ]);
  });

  it('a soma não passa do quantitativo SENASP', () => {
    const a = avaliarEdicao(com(iniciais(), 'a2', { qtd: 120000 }), TOTAL);
    expect(a.aAlocar).toBe(-7800);
    expect(a.erros[0]).toContain('passa do quantitativo SENASP');
    expect(a.podeSalvar).toBe(false);
  });

  it('a unidade não fica abaixo do que já empenhou', () => {
    const a = avaliarEdicao(com(iniciais(), 'a1', { qtd: 100000 }), TOTAL);
    expect(a.porLinha.get('a1')).toMatchObject({ minimo: 122400, abaixoDoMinimo: true });
    expect(a.erros.join(' ')).toContain('nem do que já empenhou');
    expect(a.podeSalvar).toBe(false);
    expect(avaliarEdicao(com(iniciais(), 'a1', { qtd: 122400 }), TOTAL).podeSalvar).toBe(true);
  });

  it('unidade desativada fica como está ou diminui, mas não aumenta (migration 108)', () => {
    const base = com(iniciais(), 'a2', { inativa: true });
    expect(avaliarEdicao(com(base, 'a2', { qtd: 50000 }), TOTAL).podeSalvar).toBe(true);
    const acima = avaliarEdicao(com(base, 'a2', { qtd: 60001 }), TOTAL);
    expect(acima.porLinha.get('a2')!.acimaDoGravado).toBe(true);
    expect(acima.podeSalvar).toBe(false);
    expect(acima.erros.join(' ')).toContain('DIOPI está desativada');
    // Removida não conta como acima.
    expect(avaliarEdicao(com(base, 'a2', { qtd: 70000, removida: true }), TOTAL).porLinha.get('a2')!.acimaDoGravado).toBe(false);
  });

  it('quantidade em branco ou zero não vale', () => {
    expect(avaliarEdicao(com(iniciais(), 'a2', { qtd: '' }), TOTAL).podeSalvar).toBe(false);
    expect(avaliarEdicao(com(iniciais(), 'a2', { qtd: 0 }), TOTAL).porLinha.get('a2')?.abaixoDoMinimo).toBe(true);
  });

  it('unidade com empenho vinculado, mesmo sem quantidade confirmada, não pode ser removida', () => {
    const a = avaliarEdicao(iniciais(), TOTAL);
    expect(a.porLinha.get('a1')?.podeRemover).toBe(false);
    expect(a.porLinha.get('a3')?.podeRemover).toBe(false);
    expect(a.porLinha.get('a2')?.podeRemover).toBe(true);
    const forcada = avaliarEdicao(com(iniciais(), 'a3', { removida: true }), TOTAL);
    expect(forcada.erros.join(' ')).toContain('não pode ser removida');
    expect(forcada.podeSalvar).toBe(false);
  });

  it('o contratado da unidade vira o mínimo e impede remover (migration 103)', () => {
    const contratado = new Map([['diopi', 45000], ['fnsp', 100000]]);
    const ls = linhasIniciais(gravadas, exec, contratado);
    expect(ls.map((l) => [l.unitName, l.contratado])).toEqual([['FNSP', 100000], ['DIOPI', 45000], ['CAEP', 0]]);
    const a = avaliarEdicao(com(ls, 'a2', { qtd: 40000 }), TOTAL);
    expect(a.porLinha.get('a2')).toMatchObject({ minimo: 45000, abaixoDoMinimo: true, podeRemover: false });
    expect(a.porLinha.get('a1')?.minimo).toBe(122400);
    expect(a.podeSalvar).toBe(false);
    const removida = avaliarEdicao(com(ls, 'a2', { removida: true }), TOTAL);
    expect(removida.erros.join(' ')).toContain('Unidade com contrato não pode ser removida');
    expect(avaliarEdicao(com(ls, 'a2', { qtd: 45000 }), TOTAL).podeSalvar).toBe(true);
  });

  it('remover limpa só os vínculos antigos que apontavam para a unidade removida', () => {
    const ls = com(iniciais(), 'a2', { removida: true });
    expect(vinculosSemRemovidas({ '2024NE1': 'a1', '2023NE9': 'a2' }, ls)).toEqual({ '2024NE1': 'a1' });
    expect(vinculosSemRemovidas({ '2024NE1': 'a1' }, ls)).toBeNull();
    expect(vinculosSemRemovidas({ '2024NE1': 'a1' }, iniciais())).toBeNull();
  });
});

describe('reservado a parlamentares na CAEP (decisões D3 e D4 de 27/10/2026)', () => {
  const comReserva = (aEmpenhar = 15000) => linhasIniciais(gravadas, new Map(), undefined, { total: 15000, aEmpenhar });

  it('a reserva vai só para a linha da CAEP; sem execução, o mínimo é a reserva toda', () => {
    const ls = comReserva();
    expect(ls.map((l) => [l.unitName, l.reservado, l.reservadoAEmpenhar])).toEqual([['FNSP', 0, 0], ['DIOPI', 0, 0], ['CAEP', 15000, 15000]]);
    const caep = avaliarEdicao(ls, TOTAL).porLinha.get('a3')!;
    expect(caep).toMatchObject({ minimo: 15000, motivoDoMinimo: 'reservado', abaixoDoMinimo: false, podeRemover: false });
  });

  it('abaixo do mínimo: não salva e diz o que fazer', () => {
    const a = avaliarEdicao(com(comReserva(), 'a3', { qtd: 10000 }), TOTAL);
    expect(a.porLinha.get('a3')!.abaixoDoMinimo).toBe(true);
    expect(a.podeSalvar).toBe(false);
    expect(a.erros).toEqual(['A CAEP não pode ficar com menos de 15.000: 15.000 reservados a parlamentares. Para diminuir, peça à CAEP para liberar a reserva em Emendas › Pedidos.']);
  });

  it('no mínimo ou acima, salva', () => {
    expect(avaliarEdicao(com(comReserva(), 'a3', { qtd: 15000 }), TOTAL).podeSalvar).toBe(true);
  });

  it('a CAEP com reserva não pode ser removida', () => {
    const a = avaliarEdicao(com(comReserva(), 'a3', { removida: true }), TOTAL);
    expect(a.erros).toContain('A unidade com reserva a parlamentares não pode ser removida. A reserva precisa ser liberada antes, em Emendas › Pedidos.');
  });

  it('caso real 00062/2024 item 3: contratado 36 + 9 reservados sem empenho = mínimo 45 (os 19 em contratação já estão no contratado)', () => {
    const caep: LinhaAlocacao = { id: 'c', unitName: 'CAEP', original: 60, qtd: 30, empenhado: 26.95, contratado: 36, vinculados: 0, reservado: 28, reservadoAEmpenhar: 9, removida: false, adicionada: false };
    const a = avaliarEdicao([caep], 106);
    expect(a.porLinha.get('c')).toMatchObject({ minimo: 45, motivoDoMinimo: 'contratado_e_reserva', abaixoDoMinimo: true });
    expect(a.erros).toEqual(['A CAEP não pode ficar com menos de 45: 36 contratados + 9 reservados a parlamentares ainda sem empenho. Para diminuir, peça à CAEP para liberar a reserva em Emendas › Pedidos.']);
    expect(avaliarEdicao([{ ...caep, qtd: 45 }], 106).podeSalvar).toBe(true);
  });

  it('o mínimo: maior entre contratado e empenhado, mais a reserva sem empenho, e nunca menos que a reserva toda', () => {
    expect(presoDaUnidade({ contratado: 900, empenhado: 900 })).toMatchObject({ preso: 900, motivo: 'contratado' });
    expect(presoDaUnidade({ contratado: 120, empenhado: 300 })).toMatchObject({ preso: 300, motivo: 'empenhado' });
    expect(presoDaUnidade({ contratado: 150, empenhado: 150, reservado: 620, reservadoAEmpenhar: 100 })).toMatchObject({ preso: 620, motivo: 'reservado' });
    expect(presoDaUnidade({ contratado: 150, empenhado: 150, reservado: 620, reservadoAEmpenhar: 500 })).toMatchObject({ preso: 650, motivo: 'contratado_e_reserva' });
    expect(presoDaUnidade({ contratado: 0, empenhado: 0 })).toEqual({ preso: 0, motivo: null, explicacao: null });
  });
});

describe('folgaDasUnidades (decisão D5)', () => {
  it('pode diminuir = alocado − preso, com a reserva na CAEP; as de mais folga primeiro', () => {
    const f = folgaDasUnidades(
      [
        { unitName: 'FNSP', allocatedQty: 1200, contratado: 900, empenhado: 900 },
        { unitName: 'DIOPI', allocatedQty: 300, contratado: 120, empenhado: 80 },
        { unitName: 'CAEP', allocatedQty: 800, contratado: 150, empenhado: 150 }
      ],
      { total: 620, aEmpenhar: 0 }
    );
    expect(f.map((x) => [x.unitName, x.preso, x.motivo, x.podeDiminuir])).toEqual([
      ['FNSP', 900, 'contratado', 300],
      ['CAEP', 620, 'reservado', 180],
      ['DIOPI', 120, 'contratado', 180]
    ]);
  });
});
