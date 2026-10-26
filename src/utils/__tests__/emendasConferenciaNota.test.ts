import { describe, it, expect } from 'vitest';
import { avisoDeCredor, chaveAvisoCredor, chaveNotaSemPedido, credorPorPedido, notasSemPedidoPendentes, notasSemPedidoPorEmenda, pedidoDaNota, tituloCredor, valorIgual } from '../emendasConferenciaNota';
import type { CredorDiferente, NotaSemPedido, PedidoProvavel } from '../../services/emendasService';

const linha = (linhaId: string, extra: Partial<CredorDiferente> = {}): CredorDiferente => ({
  linhaId, pedidoId: 'p520', pedido: 520, emenda: '71070008', itemKey: '00090/2024-200331-00007', nota: '2026NE000189', ug: '200330',
  credorNome: '3M GLOBAL CHANNEL SERVICES', credorDoc: 'EX3MGLOBA', fornecedorNome: 'SIGMETAL', fornecedorDoc: '11111111000111', ...extra
});
const nota = (n: string, valor: number, extra: Partial<NotaSemPedido> = {}): NotaSemPedido => ({
  empenhoId: n, nota: n, ug: '200330', dataEmissao: '2026-05-19', valorEmpenhado: valor, credorNome: 'KADOSHI', planoInterno: 'SP999S97107 - 202471070011 - BANCADA DO CEARA',
  emenda: '71070011', emendaAno: 2024, autoresDoCodigo: ['Bancada CE'], pedidosDoCodigo: ['p520'], pedidosProvaveis: [], ...extra
});

describe('nota de outro fornecedor (migration 190)', () => {
  it('agrupa por pedido e nota; a chave muda quando a nota passa a outras linhas', () => {
    const lista = [linha('l1'), linha('l2', { itemKey: '00091/2024-200331-00034', fornecedorNome: 'STAR' }), linha('l3', { pedidoId: 'p468', pedido: 468, nota: '2026NE000386', credorNome: 'CESKA' })];
    const por = credorPorPedido(lista);
    expect(por.get('p520')).toHaveLength(1);
    expect(por.get('p520')![0].linhas).toHaveLength(2);
    expect(tituloCredor(por.get('p520')![0])).toBe('Nota 2026NE000189 (3M GLOBAL CHANNEL SERVICES) em 2 itens');
    const chave = chaveAvisoCredor(por.get('p520')![0]);
    expect(chave).toBe('EMPENHO::CREDOR::200330::2026NE000189::520-2');
    expect(credorPorPedido(lista, new Set([chave])).get('p520')).toBeUndefined();
    expect(credorPorPedido([...lista, linha('l4')], new Set([chave])).get('p520')).toHaveLength(1);
  });

  it('vira o aviso do pedido, com a primeira linha', () => {
    const [g] = credorPorPedido([linha('l1')]).get('p520')!;
    expect(avisoDeCredor([g])).toMatchObject({ tipo: 'credorDiferente', curto: 'Nota de outro fornecedor', linhaId: 'l1' });
    expect(avisoDeCredor([g])!.texto).toContain('2026NE000189 (3M GLOBAL CHANNEL SERVICES): credor diferente do fornecedor da ata em 1 item');
    expect(avisoDeCredor(undefined)).toBeNull();
    expect(avisoDeCredor([])).toBeNull();
  });
});

describe('nota de emenda sem pedido (migration 190)', () => {
  it('tira as resolvidas e põe a de maior valor primeiro', () => {
    const lista = [nota('2026NE000180', 116556.9), nota('2026NE000171', 1478500), nota('2026NE000415', 375250.22, { emenda: '71020007' })];
    expect(chaveNotaSemPedido(lista[0])).toBe('EMPENHO::SEM-PEDIDO::200330::2026NE000180');
    expect(notasSemPedidoPendentes(lista, new Set(['EMPENHO::SEM-PEDIDO::200330::2026NE000415'])).map((n) => n.nota)).toEqual(['2026NE000171', '2026NE000180']);
  });
});

const prov = (pedidoNumero: number, valorSemNota: number, extra: Partial<PedidoProvavel> = {}): PedidoProvavel => ({
  pedidoId: `p${pedidoNumero}`, pedidoNumero, autorId: null, pedidoEmenda: null, pedidoEmendaAno: null, valorItens: valorSemNota, valorSemNota, mesmoCodigo: false, ...extra
});

describe('notas sem pedido agrupadas por emenda (migration 211)', () => {
  it('Bancada CE: sugere o 520 (3 notas iguais e mesmo código), à frente do 445 com uma só', () => {
    const ce = { mesmoCodigo: true, pedidoEmenda: '71070008', pedidoEmendaAno: 2026 };
    const lista = [
      nota('2026NE000171', 1478500, { pedidosProvaveis: [prov(520, 1544468.3, ce)] }),
      nota('2026NE000180', 116556.9, { pedidosProvaveis: [prov(520, 116556.9, ce), prov(445, 121820.76)] }),
      nota('2026NE000181', 17668.91, { pedidosProvaveis: [prov(520, 17668.91, ce)] }),
      nota('2026NE000183', 503003.12, { pedidosProvaveis: [prov(445, 503003.12), prov(520, 503003.12, ce)] })
    ];
    const [g] = notasSemPedidoPorEmenda(lista, new Set());
    expect(g).toMatchObject({ chave: '2024|71070011', emenda: '71070011', ano: 2024, empatados: 0 });
    expect(g.valor).toBeCloseTo(2115728.93, 2);
    expect(g.sugestao).toMatchObject({ pedidoNumero: 520, iguais: 3, mesmoCodigo: true, pedidoEmenda: '71070008' });
    expect(pedidoDaNota(lista[0], 'p520')?.valorSemNota).toBe(1544468.3);
    expect(pedidoDaNota(lista[0], 'p445')).toBeUndefined();
  });

  it('valor perto não conta; empate sem código de autor fica sem sugestão', () => {
    const lista = [
      nota('2026NE000083', 1398.22, { emenda: '44740008', emendaAno: 2025, pedidosProvaveis: [prov(418, 1398.22), prov(419, 1398.22), prov(424, 1398.22)] }),
      nota('2026NE000066', 289017, { emenda: '43510006', pedidosProvaveis: [prov(428, 301912.31, { mesmoCodigo: true })] })
    ];
    const grupos = notasSemPedidoPorEmenda(lista, new Set());
    expect(grupos.map((g) => g.emenda)).toEqual(['43510006', '44740008']);
    expect(grupos[0]).toMatchObject({ sugestao: null, empatados: 0 });
    expect(grupos[1]).toMatchObject({ sugestao: null, empatados: 3 });
  });

  it('no empate de notas iguais vale o mesmo código de autor; as resolvidas saem do grupo', () => {
    const lista = [
      nota('2026NE000086', 228601.92, { emenda: '71080015', pedidosProvaveis: [prov(422, 228601.92, { mesmoCodigo: true }), prov(540, 228601.92)] }),
      nota('2026NE000142', 108183.11, { emenda: '71080015' })
    ];
    const [g] = notasSemPedidoPorEmenda(lista, new Set());
    expect(g.sugestao).toMatchObject({ pedidoNumero: 422, iguais: 1 });
    expect(g.notas).toHaveLength(2);
    const [so] = notasSemPedidoPorEmenda(lista, new Set([chaveNotaSemPedido(lista[0])]));
    expect(so.notas.map((n) => n.nota)).toEqual(['2026NE000142']);
    expect(so.sugestao).toBeNull();
    expect(valorIgual(10, 10.05)).toBe(true);
    expect(valorIgual(10, 10.06)).toBe(false);
  });
});
