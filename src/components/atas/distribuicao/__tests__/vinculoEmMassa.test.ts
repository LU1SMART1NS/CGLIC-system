import { describe, it, expect } from 'vitest';
import { efeitoGestorDoVinculo, preverVinculo, semZeros, textoItemQtd, type EntradaPrevisao } from '../vinculoEmMassa';

const itensDaAta = [
  { numeroItem: '00001', valorUnitario: 10 },
  { numeroItem: '00002', valorUnitario: 20 },
  { numeroItem: '00004', valorUnitario: 40 }
];
const entrada = (e: Partial<EntradaPrevisao> = {}): EntradaPrevisao => ({
  numeroAta: '00059/2025',
  uasg: '200331',
  atasProvaveis: 1,
  itensDaAta,
  apiQuantidades: new Map([[4, 200], [9, 5]]),
  ...e
});

describe('preverVinculo', () => {
  it('PRONTO com os itens da ata que a API lista no contrato, com a quantidade de cada um', () => {
    const r = preverVinculo(entrada());
    expect(r).toEqual({
      status: 'PRONTO',
      itens: [{ itemKey: '00059/2025-200331-00004', numeroItem: '00004', valorUnitario: 40, quantidade: 200 }]
    });
  });

  it('REVISAR quando há mais de uma ata provável, a ata não tem itens ou a API não confirma nada', () => {
    expect(preverVinculo(entrada({ atasProvaveis: 2 }))).toMatchObject({ status: 'REVISAR', motivo: expect.stringContaining('Mais de uma ata') });
    expect(preverVinculo(entrada({ itensDaAta: [] }))).toMatchObject({ status: 'REVISAR', motivo: expect.stringContaining('não tem itens') });
    expect(preverVinculo(entrada({ apiQuantidades: new Map() }))).toMatchObject({ status: 'REVISAR', motivo: expect.stringContaining('não lista os itens') });
    expect(preverVinculo(entrada({ apiQuantidades: new Map([[9, 5]]) }))).toMatchObject({ status: 'REVISAR', motivo: expect.stringContaining('Nenhum item') });
    expect(preverVinculo(entrada({ apiQuantidades: undefined, apiErro: true }))).toMatchObject({ status: 'REVISAR', motivo: expect.stringContaining('não respondeu') });
  });

  it('CONFERINDO enquanto a API não respondeu', () => {
    expect(preverVinculo(entrada({ apiQuantidades: undefined }))).toEqual({ status: 'CONFERINDO' });
    expect(preverVinculo(entrada({ apiCarregando: true }))).toEqual({ status: 'CONFERINDO' });
  });

  it('quantidade nula: o item está no contrato, mas a API não informou a quantidade', () => {
    const r = preverVinculo(entrada({ apiQuantidades: new Map([[4, null]]) }));
    expect(r).toMatchObject({ status: 'PRONTO', itens: [{ numeroItem: '00004', quantidade: null }] });
  });
});

describe('efeitoGestorDoVinculo', () => {
  it('descreve o que acontece com o gestor e marca o que pede atenção', () => {
    expect(efeitoGestorDoVinculo(undefined, 'Ana')).toMatchObject({ tipo: 'HERDA', texto: 'Passa a ser de Ana', atencao: false });
    expect(efeitoGestorDoVinculo('Bruno', 'Ana')).toMatchObject({ tipo: 'MUDA', texto: 'Passa de Bruno para Ana', atencao: true });
    expect(efeitoGestorDoVinculo('Ana', 'Ana')).toMatchObject({ tipo: 'IGUAL', atencao: false });
    expect(efeitoGestorDoVinculo('Bruno', undefined)).toMatchObject({ tipo: 'ATA_ASSUME', texto: 'A ata passa a ser de Bruno', atencao: true });
    expect(efeitoGestorDoVinculo(undefined, undefined)).toMatchObject({ tipo: 'SEM_GESTOR', atencao: false });
  });
});

describe('textoItemQtd', () => {
  it('mostra o número do item sem zeros e a quantidade contratada lida da API', () => {
    expect(textoItemQtd({ numeroItem: '00003', quantidade: 2 })).toBe('Item 3 – Qtd contratada 2');
    expect(textoItemQtd({ numeroItem: '00009', quantidade: 12459 })).toBe('Item 9 – Qtd contratada 12.459');
  });

  it('quando a API lista o item sem quantidade, diz que não foi informada', () => {
    expect(textoItemQtd({ numeroItem: '00004', quantidade: null })).toBe('Item 4 – Qtd contratada não informada');
    expect(semZeros('00000')).toBe('0');
  });
});
