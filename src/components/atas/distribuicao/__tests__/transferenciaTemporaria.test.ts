import { describe, it, expect } from 'vitest';
import type { TransferenciaTemporaria } from '../../../../services/transferenciaTemporariaService';
import { ausenciaDe, dataBR, diasEntre, hojeISO, previaDoDesfazer, recebidasPor, resumoPorDestino, retornoChegou, textoQuantidade } from '../transferenciaTemporaria';

const BRUNO = 'b', CARLA = 'c', DIEGO = 'd', ANA = 'a';

const transf = (extra: Partial<TransferenciaTemporaria> = {}): TransferenciaTemporaria => ({
  id: 't1',
  ausenteUserId: BRUNO,
  ausenteNome: 'Bruno',
  motivo: 'FERIAS',
  inicio: '2026-11-03',
  retornoPrevisto: '2026-11-20',
  seiNumero: null,
  criadoPorNome: 'Coord',
  criadoEm: '2026-10-31T10:00:00Z',
  desfeitaEm: null,
  desfeitaPorNome: null,
  itens: [
    { tipo: 'ATA', chave: '00074/2025', origemNome: 'Bruno', origemUserId: BRUNO, destinoNome: 'Carla', destinoUserId: CARLA, devolvido: null },
    { tipo: 'ATA', chave: '00012/2026', origemNome: 'Bruno', origemUserId: BRUNO, destinoNome: 'Carla', destinoUserId: CARLA, devolvido: null },
    { tipo: 'CONTRATO', chave: '200330-00018-2025', origemNome: 'Bruno', origemUserId: BRUNO, destinoNome: 'Diego', destinoUserId: DIEGO, devolvido: null }
  ],
  ...extra
});

describe('datas', () => {
  it('formata e conta dias sem fuso', () => {
    expect(dataBR('2026-11-20')).toBe('20/11/2026');
    expect(diasEntre('2026-11-04', '2026-11-20')).toBe(16);
    expect(diasEntre('2026-11-21', '2026-11-20')).toBe(-1);
    expect(hojeISO(new Date(2026, 10, 4, 23, 30))).toBe('2026-11-04');
  });

  it('avisa o retorno no dia e depois, nunca depois de desfeita', () => {
    expect(retornoChegou(transf(), '2026-11-19')).toBe(false);
    expect(retornoChegou(transf(), '2026-11-20')).toBe(true);
    expect(retornoChegou(transf({ desfeitaEm: '2026-11-20T12:00:00Z' }), '2026-11-21')).toBe(false);
  });
});

describe('quem está ausente e quem recebeu', () => {
  it('só conta transferências em curso', () => {
    const desfeita = transf({ id: 't0', desfeitaEm: '2026-10-16T00:00:00Z' });
    expect(ausenciaDe([desfeita], BRUNO)).toBeNull();
    expect(ausenciaDe([desfeita, transf()], BRUNO)?.id).toBe('t1');
    expect(recebidasPor([desfeita], CARLA)).toEqual([]);
  });

  it('separa atas e contratos recebidos por pessoa', () => {
    const [carla] = recebidasPor([transf()], CARLA);
    expect([carla.atas, carla.contratos]).toEqual([2, 0]);
    expect(carla.chaves.has('ATA:00074/2025')).toBe(true);
    expect(recebidasPor([transf()], ANA)).toEqual([]);
    expect(resumoPorDestino(transf().itens)).toEqual([
      { nome: 'Carla', atas: 2, contratos: 0 },
      { nome: 'Diego', atas: 0, contratos: 1 }
    ]);
    expect(textoQuantidade(2, 1)).toBe('2 atas · 1 contrato');
  });
});

describe('prévia do Desfazer', () => {
  it('volta o que está com quem assumiu e fica o que mudou de mãos', () => {
    const atual: Record<string, { userId: string; nome: string }> = {
      'ATA:00074/2025': { userId: CARLA, nome: 'Carla' },
      'ATA:00012/2026': { userId: ANA, nome: 'Ana' },
      'CONTRATO:200330-00018-2025': { userId: BRUNO, nome: 'Bruno' }
    };
    const p = previaDoDesfazer(transf(), (tipo, chave) => atual[`${tipo}:${chave}`]);
    expect(p.voltam.map((i) => i.chave)).toEqual(['00074/2025', '200330-00018-2025']);
    expect(p.ficam.map((i) => [i.chave, i.atualNome])).toEqual([['00012/2026', 'Ana']]);
  });
});
