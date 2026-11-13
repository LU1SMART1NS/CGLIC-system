import { describe, expect, it } from 'vitest';
import { somarValorDasAtas } from '../valorDasAtas';
import { resumirFatias, type FatiasDaAta } from '../../../config/gruposGti';
import type { CarteiraAtaExecucao } from '../../../utils/carteiraItens';
import type { ArpRecord } from '../../../types';

const arp = (numero: string) => ({ numeroAtaRegistroPreco: numero, codigoUnidadeGerenciadora: '200331' }) as ArpRecord;
const exec = (valorSenasp: number, valorConsumido: number | null) => ({ valorSenasp, valorConsumido }) as CarteiraAtaExecucao;
const pelaValor = (f: FatiasDaAta): FatiasDaAta => ({ ...f, medida: 'VALOR' });

describe('somarValorDasAtas', () => {
  const execucao = new Map([
    ['A', exec(1000, 250)],
    ['B', exec(500, null)]
  ]);
  const fatias = new Map([
    ['A', pelaValor(resumirFatias([{ grupo: 'LIGABOM', quantidade: 600, orgaos: 3 }, { grupo: 'CNCG', quantidade: 400, orgaos: 2 }]))],
    ['B', pelaValor(resumirFatias([{ grupo: 'CNCG', quantidade: 300, orgaos: 1 }]))]
  ]);
  const somar = (gti: 'TODOS' | 'LIGABOM' | 'CNCG') =>
    somarValorDasAtas([arp('A'), arp('B')], (a) => execucao.get(a.numeroAtaRegistroPreco), (a) => fatias.get(a.numeroAtaRegistroPreco), gti);

  it('soma a parte SENASP e o consumido (consumido não lido conta zero)', () => {
    const t = somar('TODOS');
    expect(t).toMatchObject({ atas: 2, valorSenasp: 1500, valorConsumido: 250, registradoParticipantes: 1300, registradoGti: 0 });
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
