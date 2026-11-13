import { describe, expect, it } from 'vitest';
import { somarValorDasAtas } from '../valorDasAtas';
import { SEM_UNIDADE } from '../../carteira/CarteiraExecucaoSelects';
import { resumirFatias, type FatiasDaAta } from '../../../config/gruposGti';
import type { CarteiraAtaExecucao } from '../../../utils/carteiraItens';
import type { ArpRecord } from '../../../types';

const arp = (numero: string) => ({ numeroAtaRegistroPreco: numero, codigoUnidadeGerenciadora: '200331' }) as ArpRecord;
const exec = (valorSenasp: number, valorConsumido: number | null, valorTotal = valorSenasp * 2, alocado: Record<string, number> = {}) =>
  ({ valorTotal, valorSenasp, valorConsumido, valorAlocadoPorUnidade: alocado, valorSemUnidade: valorSenasp / 10 }) as CarteiraAtaExecucao;
const pelaValor = (f: FatiasDaAta): FatiasDaAta => ({ ...f, medida: 'VALOR' });

describe('somarValorDasAtas', () => {
  const execucao = new Map([
    ['A', exec(1000, 250, 2000, { caep: 400, diopi: 100 })],
    ['B', exec(500, null, 1000, { caep: 50 })]
  ]);
  const fatias = new Map([
    ['A', pelaValor(resumirFatias([{ grupo: 'LIGABOM', quantidade: 600, orgaos: 3 }, { grupo: 'CNCG', quantidade: 400, orgaos: 2 }]))],
    ['B', pelaValor(resumirFatias([{ grupo: 'CNCG', quantidade: 300, orgaos: 1 }]))]
  ]);
  const somar = (gti: 'TODOS' | 'LIGABOM' | 'CNCG') =>
    somarValorDasAtas([arp('A'), arp('B')], (a) => execucao.get(a.numeroAtaRegistroPreco), (a) => fatias.get(a.numeroAtaRegistroPreco), gti);

  it('soma a parte SENASP e o consumido (consumido não lido conta zero)', () => {
    const t = somar('TODOS');
    expect(t).toMatchObject({ atas: 2, valorTotal: 3000, valorSenasp: 1500, valorConsumido: 250, registradoParticipantes: 1300, registradoGti: 0 });
  });

  it('com unidade filtrada, soma o alocado a ela em cada ata', () => {
    const t = somarValorDasAtas([arp('A'), arp('B')], (a) => execucao.get(a.numeroAtaRegistroPreco), () => undefined, 'TODOS', 'caep');
    expect(t.alocadoUnidade).toBe(450);
    // "Sem unidade" soma o que falta alocar em cada ata.
    expect(somarValorDasAtas([arp('A'), arp('B')], (a) => execucao.get(a.numeroAtaRegistroPreco), () => undefined, 'TODOS', SEM_UNIDADE).alocadoUnidade).toBe(150);
    expect(somar('TODOS').alocadoUnidade).toBe(0);
  });

  it('com GTI filtrado, soma a fatia dele em cada ata', () => {
    expect(somar('CNCG').registradoGti).toBe(700);
    expect(somar('LIGABOM').registradoGti).toBe(600);
  });

  it('fatias em unidades (sem valor) não entram no registrado', () => {
    const t = somarValorDasAtas([arp('C')], () => exec(10, 0), () => resumirFatias([{ grupo: 'CNCG', quantidade: 50, orgaos: 1 }]), 'CNCG');
    expect(t.registradoParticipantes).toBe(0);
    expect(t.registradoGti).toBe(0);
  });
});
