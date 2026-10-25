import { describe, it, expect } from 'vitest';
import { avisoDeCredor, chaveAvisoCredor, chaveNotaSemPedido, credorPorPedido, notasSemPedidoPendentes, tituloCredor } from '../emendasConferenciaNota';
import type { CredorDiferente, NotaSemPedido } from '../../services/emendasService';

const linha = (linhaId: string, extra: Partial<CredorDiferente> = {}): CredorDiferente => ({
  linhaId, pedidoId: 'p520', pedido: 520, emenda: '71070008', itemKey: '00090/2024-200331-00007', nota: '2026NE000189', ug: '200330',
  credorNome: '3M GLOBAL CHANNEL SERVICES', credorDoc: 'EX3MGLOBA', fornecedorNome: 'SIGMETAL', fornecedorDoc: '11111111000111', ...extra
});
const nota = (n: string, valor: number, extra: Partial<NotaSemPedido> = {}): NotaSemPedido => ({
  empenhoId: n, nota: n, ug: '200330', dataEmissao: '2026-05-19', valorEmpenhado: valor, credorNome: 'KADOSHI', planoInterno: 'SP999S97107 - 202471070011 - BANCADA DO CEARA',
  emenda: '71070011', emendaAno: 2024, autoresDoCodigo: ['Bancada CE'], pedidosDoCodigo: ['p520'], ...extra
});

describe('nota de outro fornecedor (migration 190)', () => {
  it('agrupa por pedido e nota; a chave muda quando a nota passa a outras linhas', () => {
    const lista = [linha('l1'), linha('l2', { itemKey: '00091/2024-200331-00034', fornecedorNome: 'STAR' }), linha('l3', { pedidoId: 'p468', pedido: 468, nota: '2026NE000386', credorNome: 'CESKA' })];
    const por = credorPorPedido(lista);
    expect(por.get('p520')).toHaveLength(1);
    expect(por.get('p520')![0].linhas).toHaveLength(2);
    expect(tituloCredor(por.get('p520')![0])).toBe('Nota 2026NE000189 (3M GLOBAL CHANNEL SERVICES) em 2 linhas');
    const chave = chaveAvisoCredor(por.get('p520')![0]);
    expect(chave).toBe('EMPENHO::CREDOR::200330::2026NE000189::520-2');
    expect(credorPorPedido(lista, new Set([chave])).get('p520')).toBeUndefined();
    expect(credorPorPedido([...lista, linha('l4')], new Set([chave])).get('p520')).toHaveLength(1);
  });

  it('vira o aviso do pedido, com a primeira linha', () => {
    const [g] = credorPorPedido([linha('l1')]).get('p520')!;
    expect(avisoDeCredor([g])).toMatchObject({ tipo: 'credorDiferente', curto: 'Nota de outro fornecedor', linhaId: 'l1' });
    expect(avisoDeCredor([g])!.texto).toContain('2026NE000189 (3M GLOBAL CHANNEL SERVICES): credor diferente do fornecedor da ata em 1 linha');
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
