import { describe, it, expect } from 'vitest';
import { avisosDeEmpenho, chaveAvisoEmpenho, diferencasPorPedido, emendasAConferir, etiquetaDaConferencia, motivoAConferir } from '../emendasEmpenho';
import { avisosDoPedido } from '../emendasPedidos';
import type { ConferenciaEmpenho, ItemCaep, PedidoEmenda } from '../../services/emendasService';

const conf = (extra: Partial<ConferenciaEmpenho>): ConferenciaEmpenho => ({
  emenda: '71250002', itemKey: '00018/2025-200331-00002', qtdPedido: 197, qtdNasNotas: 200, notas: ['2026NE000175'], pedidos: [445], pedidoIds: ['p445'],
  situacao: 'A_MAIS', notasFora: [], notasNaoLidas: [], notasPorValor: [], notasComItemSemAta: [], ...extra
});
const itens = new Map<string, ItemCaep>([
  ['00018/2025-200331-00002', { itemKey: '00018/2025-200331-00002', numeroAta: '00018/2025', codigoUasg: '200331', numeroItem: '00002', descricao: 'Camioneta/SUV', nomeCurto: 'Trailblazer', codigoPdm: 1, valorUnitario: 1, vigenciaFinal: '2027-01-01', ataEncerrada: false, alocado: 300 } as ItemCaep],
  ['00067/2024-200331-00025', { itemKey: '00067/2024-200331-00025', numeroAta: '00067/2024', codigoUasg: '200331', numeroItem: '00025', descricao: 'Bússola Submersível', codigoPdm: 1, valorUnitario: 1, vigenciaFinal: '2027-01-01', ataEncerrada: false, alocado: 10 } as ItemCaep]
]);
const menos = conf({ emenda: '43900005', itemKey: '00067/2024-200331-00025', qtdPedido: 4, qtdNasNotas: 0, notas: [], pedidos: [426], pedidoIds: ['p426'], situacao: 'A_MENOS' });

describe('empenhado × pedido das emendas', () => {
  it('a chave do Resolvido leva as duas quantidades: muda a quantidade, o aviso volta', () => {
    expect(chaveAvisoEmpenho(conf({}))).toBe('EMPENHO::71250002::00018/2025-200331-00002::A_MAIS-197-200');
    expect(chaveAvisoEmpenho(conf({ qtdPedido: 198 }))).not.toBe(chaveAvisoEmpenho(conf({})));
  });

  it('só a mais e a menos viram aviso, por pedido, e o resolvido sai', () => {
    const lista = [conf({}), menos, conf({ situacao: 'A_CONFERIR', pedidoIds: ['p1'] }), conf({ situacao: 'IGUAL', pedidoIds: ['p2'] })];
    const d = diferencasPorPedido(lista, new Set<string>());
    expect([...d.keys()].sort()).toEqual(['p426', 'p445']);
    expect(diferencasPorPedido(lista, new Set([chaveAvisoEmpenho(conf({}))])).has('p445')).toBe(false);
  });

  it('item em vários pedidos da emenda avisa em todos', () => {
    const d = diferencasPorPedido([conf({ pedidoIds: ['a', 'b'], pedidos: [1, 2] })], new Set<string>());
    expect(d.get('a')).toHaveLength(1);
    expect(d.get('b')).toHaveLength(1);
  });

  it('avisos: a mais vermelho com a frase da nota; a menos amarelo', () => {
    const a = avisosDeEmpenho([conf({}), menos], itens);
    expect(a.map((x) => x.tipo)).toEqual(['empenhoAMais', 'empenhoAMenos']);
    expect(a[0].texto).toContain('Trailblazer: 200 na nota × 197 no pedido');
    expect(a[1].texto).toContain('Bússola submersível: 0 na nota × 4 no pedido');
  });

  it('o pedido só recebe o aviso depois do empenho, e a mais vem antes do que é só atenção', () => {
    const base = { id: 'p445', numero: 445, autorId: 'C:1', origem: 'SISTEMA', linhas: [], documentos: [], devolucoes: [], empenhadoDocumentosSei: [], contratacaoDocumentosSei: [] } as unknown as PedidoEmenda;
    expect(avisosDoPedido({ ...base, etapa: 'CONTRATACAO' }, itens, '2026-10-25', undefined, [conf({})]).map((x) => x.tipo)).toEqual(['empenhoAMais']);
    expect(avisosDoPedido({ ...base, etapa: 'CGOFI' }, itens, '2026-10-25', undefined, [conf({})])).toEqual([]);
  });

  it('etiqueta da linha: igual, a mais, a menos, resolvido e a conferir com o motivo', () => {
    expect(etiquetaDaConferencia(conf({ situacao: 'IGUAL', qtdPedido: 3, qtdNasNotas: 3 }), false)).toMatchObject({ texto: '3 de 3 na nota', tom: 'ok' });
    expect(etiquetaDaConferencia(conf({}), false)).toMatchObject({ texto: '200 na nota · 197 no pedido', tom: 'mais' });
    expect(etiquetaDaConferencia(menos, false)).toMatchObject({ texto: '0 de 4 nas notas', tom: 'menos' });
    expect(etiquetaDaConferencia(menos, true)).toMatchObject({ texto: 'resolvido · 0 de 4', tom: 'cinza' });
    const aConferir = conf({ situacao: 'A_CONFERIR', qtdPedido: 84, qtdNasNotas: 21, notasFora: ['2026NE000161', '2026NE000164'] });
    expect(etiquetaDaConferencia(aConferir, false)?.dica).toContain('faltam 2 notas do SEI no sistema (2026NE000161, 2026NE000164)');
    expect(etiquetaDaConferencia(conf({ situacao: 'SEM_NOTA' }), false)).toBeNull();
    expect(etiquetaDaConferencia(undefined, false)).toBeNull();
  });

  it('motivo a conferir junta notas fora, não lidas e por valor', () => {
    expect(motivoAConferir({ notasFora: [], notasNaoLidas: ['2026NE000099'], notasPorValor: ['2026NE000024'], notasComItemSemAta: [] })).toBe(
      'nota ainda não lida no Portal (2026NE000099); nota em reais, sem quantidade (2026NE000024)'
    );
    expect(motivoAConferir({ notasFora: [], notasNaoLidas: ['1', '2', '3', '4', '5'], notasPorValor: [], notasComItemSemAta: [] })).toBe('5 notas ainda não lidas no Portal (1, 2, 3 e mais 2)');
  });

  it('lista a conferir: uma linha por emenda, com o que as notas lidas já mostram', () => {
    const l = emendasAConferir(
      [
        conf({ situacao: 'A_CONFERIR', qtdPedido: 84, qtdNasNotas: 21, notasFora: ['2026NE000161'] }),
        conf({ situacao: 'A_CONFERIR', itemKey: '00067/2024-200331-00025', qtdPedido: 4, qtdNasNotas: 0, notasFora: ['2026NE000161'], pedidoIds: ['p511'], pedidos: [511] }),
        menos
      ],
      itens
    );
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ emenda: '71250002', itens: 2, pedidos: [445, 511], parciais: ['Trailblazer: 21 de 84'] });
  });
});
