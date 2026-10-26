import { describe, expect, it } from 'vitest';
import { agruparPorBeneficiario, beneficiarioDaLinha, definirNoGrupo, gradePorItem, moverLinha, repartirLinha, somarNoGrupo, type LinhaDoGrupo } from '../emendasReserva';

let n = 0;
const nova = () => `n${++n}`;
const item = (chave: string, itemKey: string, quantidade: number, grupo: string, id?: string): LinhaDoGrupo => ({ chave, id, tipo: 'ITEM', itemKey, kitId: null, quantidade, grupo });
const resumo = (ls: LinhaDoGrupo[]) => ls.map((l) => `${l.grupo}:${l.itemKey ?? l.kitId}=${l.quantidade}`);

describe('agruparPorBeneficiario', () => {
  it('um grupo por beneficiário, na ordem em que aparece', () => {
    const r = agruparPorBeneficiario(
      [
        { chave: 'a', beneficiarioId: 'pm' },
        { chave: 'b', beneficiarioId: 'cbm' },
        { chave: 'c', beneficiarioId: 'pm' }
      ],
      nova
    );
    expect(r.grupos.map((g) => g.beneficiarioId)).toEqual(['pm', 'cbm']);
    expect(r.linhas[0].grupo).toBe(r.linhas[2].grupo);
    expect(r.linhas[1].grupo).not.toBe(r.linhas[0].grupo);
    expect(beneficiarioDaLinha(r.linhas[1], r.grupos)).toBe('cbm');
  });
  it('sem linhas: um grupo a informar', () => {
    const r = agruparPorBeneficiario([], nova);
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0].beneficiarioId).toBeNull();
  });
});

describe('somarNoGrupo', () => {
  it('soma na linha igual do grupo ou cria logo depois do grupo', () => {
    const ls = [item('a', 'capa', 10, 'g1'), item('b', 'capa', 20, 'g2')];
    expect(resumo(somarNoGrupo(ls, ls[0], 'g2', 5, nova))).toEqual(['g1:capa=10', 'g2:capa=25']);
    const outro = item('x', 'arma', 1, 'g1');
    expect(resumo(somarNoGrupo(ls, outro, 'g1', 2, nova))).toEqual(['g1:capa=10', 'g1:arma=2', 'g2:capa=20']);
  });
});

describe('repartirLinha', () => {
  it('a parte do próprio grupo fica na linha (com o id); o resto vai para os outros grupos', () => {
    const ls = [item('a', 'capa', 10, 'g1', 'id-a'), item('b', 'arma', 2, 'g2')];
    const r = repartirLinha(ls, 'a', new Map([['g1', 6], ['g2', 4]]), nova);
    expect(resumo(r)).toEqual(['g1:capa=6', 'g2:arma=2', 'g2:capa=4']);
    expect(r[0].id).toBe('id-a');
  });
  it('tudo para outro grupo: a linha sai e soma na igual do destino', () => {
    const ls = [item('a', 'capa', 10, 'g1'), item('b', 'capa', 3, 'g2')];
    expect(resumo(repartirLinha(ls, 'a', new Map([['g1', 0], ['g2', 10]]), nova))).toEqual(['g2:capa=13']);
  });
  it('soma diferente da quantidade: não muda nada', () => {
    const ls = [item('a', 'capa', 10, 'g1')];
    expect(repartirLinha(ls, 'a', new Map([['g1', 6], ['g2', 3]]), nova)).toBe(ls);
  });
});

describe('moverLinha', () => {
  it('leva a linha inteira, mantendo id e chave', () => {
    const ls = [item('a', 'capa', 10, 'g1', 'id-a'), item('b', 'arma', 2, 'g2'), item('c', 'colchonete', 1, 'g1')];
    const r = moverLinha(ls, 'a', 'g2');
    expect(resumo(r)).toEqual(['g2:arma=2', 'g2:capa=10', 'g1:colchonete=1']);
    expect(r[1]).toMatchObject({ chave: 'a', id: 'id-a' });
  });
  it('o destino já tem o item: soma', () => {
    const ls = [item('a', 'capa', 10, 'g1'), item('b', 'capa', 2, 'g2')];
    expect(resumo(moverLinha(ls, 'a', 'g2'))).toEqual(['g2:capa=12']);
  });
});

describe('grade Por item', () => {
  it('uma linha por item com a quantidade de cada grupo', () => {
    const ls = [item('a', 'capa', 10, 'g1'), item('b', 'arma', 2, 'g1'), item('c', 'capa', 5, 'g2')];
    const g = gradePorItem(ls);
    expect(g.map((x) => x.conteudo)).toEqual(['ITEM:capa', 'ITEM:arma']);
    expect(g[0].total).toBe(15);
    expect(g[0].porGrupo.get('g2')).toBe(5);
  });
  it('célula: define, cria e tira (0)', () => {
    const ls = [item('a', 'capa', 10, 'g1'), item('c', 'capa', 5, 'g2')];
    expect(resumo(definirNoGrupo(ls, ls[0], 'g2', 7, nova))).toEqual(['g1:capa=10', 'g2:capa=7']);
    expect(resumo(definirNoGrupo(ls, ls[0], 'g2', 0, nova))).toEqual(['g1:capa=10']);
    expect(resumo(definirNoGrupo(ls, ls[0], 'g3', 2, nova))).toEqual(['g1:capa=10', 'g2:capa=5', 'g3:capa=2']);
  });
});
