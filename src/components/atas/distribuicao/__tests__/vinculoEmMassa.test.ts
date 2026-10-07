import { describe, it, expect } from 'vitest';
import {
  efeitoGestorDoVinculo,
  efeitoGestorVariasAtas,
  ordemDasAtas,
  preverVinculo,
  preverVinculoVariasAtas,
  semZeros,
  textoItemQtd,
  type EntradaPrevisao
} from '../vinculoEmMassa';

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
    // Ata de outra compra: os números dos itens da API não são os da ata, mesmo que coincidam.
    expect(preverVinculo(entrada({ compraDiferente: true }))).toMatchObject({ status: 'REVISAR', motivo: expect.stringContaining('outra compra') });
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

describe('contrato em mais de uma ata (migration 86)', () => {
  const ata53 = { numeroAta: '00053/2025', uasg: '200331', itensDaAta: [{ numeroItem: '00010', valorUnitario: 5 }] };
  const ata25 = { numeroAta: '00025/2025', uasg: '200331', itensDaAta: [{ numeroItem: '00011', valorUnitario: 7 }, { numeroItem: '00012' }] };
  const api = new Map<number, number | null>([
    [10, 1200],
    [11, 800]
  ]);

  it('cada item que a API lista vai para a ata que o tem: o 00033/2026 fica com o item 10 na Ata 53 e o 11 na Ata 25', () => {
    const p = preverVinculoVariasAtas({ atas: [ata53, ata25], apiQuantidades: api });
    expect(p.status).toBe('PRONTO');
    if (p.status !== 'PRONTO') return;
    expect(p.porAta.map((a) => [a.numeroAta, a.itens.map((i) => [i.itemKey, i.quantidade])])).toEqual([
      ['00053/2025', [['00053/2025-200331-00010', 1200]]],
      ['00025/2025', [['00025/2025-200331-00011', 800]]]
    ]);
  });

  it('o mesmo item em duas atas pede a escolha da ata', () => {
    const dup = { ...ata25, itensDaAta: [{ numeroItem: '00010' }] };
    expect(preverVinculoVariasAtas({ atas: [ata53, dup], apiQuantidades: api })).toEqual({
      status: 'REVISAR',
      motivo: 'O item 10 está nas atas 00053/2025 e 00025/2025: escolha a ata'
    });
  });

  it('ata sem item do contrato sai do plano; os itens já vinculados não entram de novo', () => {
    const p = preverVinculoVariasAtas({ atas: [ata53, ata25], apiQuantidades: new Map([[10, 5]]) });
    expect(p.status === 'PRONTO' && p.porAta.map((a) => a.numeroAta)).toEqual(['00053/2025']);
    const parcial = preverVinculoVariasAtas({ atas: [ata25], apiQuantidades: api, itensJaVinculados: new Set([10]) });
    expect(parcial.status === 'PRONTO' && parcial.porAta[0].itens.map((i) => i.numeroItem)).toEqual(['00011']);
    expect(preverVinculoVariasAtas({ atas: [ata25], apiQuantidades: new Map([[10, 5]]), itensJaVinculados: new Set([10]) })).toEqual({
      status: 'REVISAR',
      motivo: 'Os itens que faltam não estão nesta ata'
    });
  });

  it('espera a API e repassa a falha dela', () => {
    expect(preverVinculoVariasAtas({ atas: [ata53, ata25], apiCarregando: true })).toEqual({ status: 'CONFERINDO' });
    expect(preverVinculoVariasAtas({ atas: [ata53, ata25], apiErro: true })).toEqual({ status: 'REVISAR', motivo: 'A API oficial não respondeu' });
  });

  it('gestor: atas de gestores diferentes pedem a escolha, com o gestor atual do contrato primeiro', () => {
    const e = efeitoGestorVariasAtas('Daniel', [{ numeroAta: '00053/2025' }, { numeroAta: '00025/2025', gestorNome: 'Ana' }]);
    expect(e).toMatchObject({ conflito: true, candidatos: ['Daniel', 'Ana'] });
    expect(e.textos).toEqual(['Ata 00053/2025: sem gestor', 'Ata 00025/2025: Ana']);
  });

  it('gestor: sem conflito, as atas sem gestor passam ao gestor do contrato', () => {
    expect(efeitoGestorVariasAtas('Daniel', [{ numeroAta: '00053/2025' }, { numeroAta: '00025/2025' }])).toEqual({
      conflito: false,
      candidatos: [],
      textos: ['A ata 00053/2025 passa a ser de Daniel', 'A ata 00025/2025 passa a ser de Daniel'],
      atencao: true
    });
    expect(efeitoGestorVariasAtas(undefined, [{ numeroAta: '00053/2025', gestorNome: 'Ana', jaVinculada: true }, { numeroAta: '00025/2025', gestorNome: 'Ana' }]).textos).toEqual([
      'Passa a ser de Ana'
    ]);
    expect(efeitoGestorVariasAtas('Ana', [{ numeroAta: '00053/2025', gestorNome: 'Ana' }, { numeroAta: '00025/2025', gestorNome: 'Ana' }]).textos).toEqual(['Já é de Ana']);
    // Uma ata só: as regras de sempre.
    expect(efeitoGestorVariasAtas('Daniel', [{ numeroAta: '00053/2025', gestorNome: 'Ana' }]).textos).toEqual(['Passa de Daniel para Ana']);
  });

  it('ordem de gravação: com gestor no contrato, a ata dele, depois as sem gestor, depois as de outro; sem gestor, as com gestor primeiro', () => {
    const atas = [{ n: 'ana', gestorNome: 'Ana' }, { n: 'sem' }, { n: 'daniel', gestorNome: 'Daniel' }];
    expect(ordemDasAtas('Daniel', atas).map((a) => a.n)).toEqual(['daniel', 'sem', 'ana']);
    expect(ordemDasAtas(undefined, atas).map((a) => a.n)).toEqual(['ana', 'daniel', 'sem']);
  });
});
