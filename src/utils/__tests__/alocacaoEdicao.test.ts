import { describe, it, expect } from 'vitest';
import { avaliarEdicao, linhasIniciais, listaParaGravar, vinculosSemRemovidas, type LinhaAlocacao } from '../alocacaoEdicao';
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
