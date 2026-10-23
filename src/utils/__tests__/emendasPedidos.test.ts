import { describe, it, expect } from 'vitest';
import { avisosDoPedido, itensDaLinha, proximaAcao, reservadoPorItem, valorDoPedido } from '../emendasPedidos';
import type { ItemCaep, LinhaPedido, PedidoEmenda } from '../../services/emendasService';

const HOJE = '2026-10-23';
const item = (k: string, extra: Partial<ItemCaep> = {}): ItemCaep => ({
  itemKey: k, numeroAta: '00031/2025', codigoUasg: '200331', numeroItem: '00001', descricao: k, codigoPdm: 1,
  valorUnitario: 100, vigenciaFinal: '2027-06-25', ataEncerrada: false, alocado: 100, ...extra
});
const linha = (extra: Partial<LinhaPedido>): LinhaPedido => ({
  id: 'l' + Math.random(), ordem: 1, tipo: 'ITEM', itemKey: 'a', kitId: null, kitNome: null, kitVersao: null, kitComposicao: null,
  quantidade: 1, beneficiarioId: null, notaEmpenho: null, cancelada: false, canceladaMotivo: null, ...extra
});
const pedido = (extra: Partial<PedidoEmenda>): PedidoEmenda => ({
  id: 'p' + Math.random(), numero: 1, autorId: 'C:1', etapa: 'RESERVADO', origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-10-20',
  minutaEm: null, minutaDocumentoSei: null, oficioNumero: null, oficioProcessoSei: null, oficioEm: null, divergencia: null, siopEmenda: null,
  siopValor: null, siopGnd: null, conferidoEm: null, autorizadoEm: null, autorizadoDocumentoSei: null, empenhadoEm: null, canceladoEm: null,
  canceladoMotivo: null, versao: 1, atualizadoPorNome: null, atualizadoEm: null, linhas: [], ...extra
});
const itens = new Map([item('a'), item('b', { valorUnitario: 10, numeroAta: '00061/2024', vigenciaFinal: '2026-12-19' }), item('v', { ataEncerrada: true, numeroAta: '00020/2025', vigenciaFinal: '2026-05-28' })].map((i) => [i.itemKey, i]));
const kit = linha({ tipo: 'KIT', itemKey: null, kitId: 'k', kitComposicao: [{ itemKey: 'a', quantidade: 1 }, { itemKey: 'b', quantidade: 2 }], quantidade: 10 });

describe('pedidos das emendas', () => {
  it('kit ocupa N vezes a composição do dia', () => {
    expect(itensDaLinha(kit)).toEqual([{ itemKey: 'a', quantidade: 10 }, { itemKey: 'b', quantidade: 20 }]);
  });

  it('reservado soma pedidos e linhas não cancelados, e pode excluir o pedido em edição', () => {
    const p1 = pedido({ linhas: [kit, linha({ itemKey: 'a', quantidade: 5 }), linha({ itemKey: 'a', quantidade: 99, cancelada: true })] });
    const p2 = pedido({ etapa: 'CANCELADO', linhas: [linha({ itemKey: 'a', quantidade: 50 })] });
    expect(Object.fromEntries(reservadoPorItem([p1, p2]))).toEqual({ a: 15, b: 20 });
    expect(reservadoPorItem([p1, p2], p1.id).size).toBe(0);
  });

  it('valor pelo preço da ata', () => {
    expect(valorDoPedido(pedido({ linhas: [kit] }), itens)).toBe(10 * 100 + 20 * 10);
  });

  it('avisos: 30 dias sem ofício, divergência e ata vencendo ou vencida antes do empenho', () => {
    expect(avisosDoPedido(pedido({ reservadoEm: '2026-09-01', linhas: [linha({})] }), itens, HOJE).map((a) => a.texto)).toEqual(['52 dias sem ofício']);
    expect(avisosDoPedido(pedido({ etapa: 'OFICIO', divergencia: 'x', linhas: [linha({})] }), itens, HOJE)[0].tipo).toBe('divergencia');
    expect(avisosDoPedido(pedido({ linhas: [kit] }), itens, HOJE)[0].texto).toContain('Ata 00061/2024 vence em 57 dias');
    expect(avisosDoPedido(pedido({ etapa: 'CONFERIDO', linhas: [linha({ itemKey: 'v' })] }), itens, HOJE)[0].texto).toBe('Ata 00020/2025 encerrada em 28/05/2026: trocar o item ou tirar a linha');
    expect(avisosDoPedido(pedido({ etapa: 'EMPENHADO', linhas: [linha({ itemKey: 'v' })] }), itens, HOJE)).toEqual([]);
  });

  it('próximo passo de cada etapa', () => {
    expect(proximaAcao('RESERVADO')?.acao).toBe('MINUTA');
    expect(proximaAcao('OFICIO')?.acao).toBe('CONFERIDO');
    expect(proximaAcao('EMPENHADO')).toBeNull();
  });
});

describe('identificação e contato', () => {
  it('sem ofício, a reserva é identificada pela data; com ofício, pelo ofício', async () => {
    const { identificacaoDoPedido } = await import('../emendasPedidos');
    expect(identificacaoDoPedido({ oficioNumero: null, reservadoEm: '2026-10-03' })).toBe('Reserva de 03/10/2026');
    expect(identificacaoDoPedido({ oficioNumero: 'Ofício nº 45/2026', reservadoEm: '2026-10-03' })).toBe('Ofício nº 45/2026');
  });

  it('sugere o último contato da assessoria usado com cada autor', async () => {
    const { ultimoContatoPorAutor } = await import('../emendasPedidos');
    const m = ultimoContatoPorAutor([
      pedido({ autorId: 'C:1', contatoNome: 'Antigo', atualizadoEm: '2026-09-01T10:00:00Z' }),
      pedido({ autorId: 'C:1', contatoNome: 'Novo', contatoTelefone: '61999990000', atualizadoEm: '2026-10-01T10:00:00Z' }),
      pedido({ autorId: 'C:2' })
    ]);
    expect(m.get('C:1')).toEqual({ contatoNome: 'Novo', contatoTelefone: '61999990000', contatoEmail: null });
    expect(m.has('C:2')).toBe(false);
  });
});
