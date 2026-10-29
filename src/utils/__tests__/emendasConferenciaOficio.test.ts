import { describe, it, expect } from 'vitest';
import type { ItemCaep, LinhaPedido, PedidoEmenda } from '../../services/emendasService';
import type { PrecoDoItem } from '../../services/emendasQuadroService';
import {
  ajustesFeitos,
  cabeNaEmenda,
  linhasParaConferir,
  linhasParaSalvar,
  livrePorItem,
  passaDoSaldo,
  precosDaMinuta,
  precosQueMudaram,
  oficioForaDoPrazo,
  sobraDaEmendaParaOPedido,
  valorDosItens,
  type LinhaConferida
} from '../emendasConferenciaOficio';

const VIATURA = '00102/2024-200330-00001';
const MOTO = '00102/2024-200330-00002';
const item = (itemKey: string, valorUnitario: number, alocado = 10): ItemCaep => ({
  itemKey,
  numeroAta: '00102/2024',
  codigoUasg: '200330',
  numeroItem: itemKey.slice(-5),
  descricao: itemKey,
  codigoPdm: null,
  valorUnitario,
  vigenciaFinal: '2027-06-30',
  ataEncerrada: false,
  alocado
});
const itens = new Map([item(VIATURA, 298000), item(MOTO, 38500)].map((i) => [i.itemKey, i]));
const linha = (id: string, itemKey: string, quantidade: number): LinhaPedido => ({
  id,
  ordem: 1,
  tipo: 'ITEM',
  itemKey,
  kitId: null,
  kitNome: null,
  kitVersao: null,
  kitComposicao: null,
  quantidade,
  beneficiarioId: 'b1',
  cancelada: false,
  canceladaMotivo: null,
  empenhoDocumentoSei: null,
  contratoNumero: null,
  despachoDocumentoSei: null
});
const pedido = (minutaPrecos: Record<string, number> | null): PedidoEmenda =>
  ({ id: 'p', versao: 1, linhas: [linha('l1', VIATURA, 3), linha('l2', MOTO, 4)], minutaPrecos }) as unknown as PedidoEmenda;
const previsto = (itemKey: string, precoPrevisto: number): [string, PrecoDoItem] => [
  itemKey,
  { itemKey, precoAtual: precoPrevisto, dataReajuste: null, origem: null, devido: false, precoDevido: null }
];

describe('conferência do ofício: o previsto cabe no que sobra da emenda (28/10/2026)', () => {
  it('a minuta guarda o preço previsto de cada item; a conferência soma o previsto de hoje das linhas que ficam', () => {
    const precos = new Map([previsto(VIATURA, 300000), previsto(MOTO, 40000)]);
    const p = pedido(null);
    expect(precosDaMinuta(p, itens, precos)).toEqual({ [VIATURA]: 300000, [MOTO]: 40000 });
    const [v, m] = linhasParaConferir(p);
    expect(valorDosItens([v, m], itens, precos)).toBe(1060000);
    expect(valorDosItens([{ ...v, quantidade: 2 }, { ...m, retirada: true }], itens, precos)).toBe(600000);
  });

  it('a sobra desconta os outros pedidos da emenda (pelo ofício, ou pelo previsto sem ofício); igual cabe', () => {
    const outroComOficio = { ...pedido(null), id: 'o1', etapa: 'CONTRATACAO', oficioValor: 200000 } as PedidoEmenda;
    const outroSemOficio = { ...pedido(null), id: 'o2', etapa: 'RESERVADO', oficioValor: null, linhas: [linha('x', MOTO, 2)] } as PedidoEmenda;
    const conta = sobraDaEmendaParaOPedido(1300000, [outroComOficio, outroSemOficio], itens);
    expect(conta).toEqual({ outros: 277000, sobra: 1023000 });
    expect(cabeNaEmenda(1023000, conta.sobra)).toBe(true);
    expect(cabeNaEmenda(1023000.01, conta.sobra)).toBe(false);
  });

  it('o preço que mudou depois da minuta só informa, com a ata; a linha acrescentada não acusa', () => {
    const precos = new Map([previsto(VIATURA, 310000), previsto(MOTO, 38500)]);
    const p = pedido({ [VIATURA]: 298000, [MOTO]: 38500 });
    const linhas = linhasParaConferir(p);
    expect(precosQueMudaram(linhas, p, itens, precos)).toEqual([{ itemKey: VIATURA, numeroAta: '00102/2024', naMinuta: 298000, hoje: 310000 }]);
    const nova: LinhaConferida = { ...linhas[0], chave: 'nova-1', id: null, original: 0, quantidade: 1 };
    expect(precosQueMudaram([nova], p, itens, precos)).toEqual([]);
  });
});

describe('conferência do ofício: ajustes ao ofício', () => {
  const nome = (l: LinhaConferida) => (l.itemKey === VIATURA ? 'Viatura → PMX' : 'Moto → PMX');

  it('sem ajuste, nada vai para o banco além da etapa', () => {
    const linhas = linhasParaConferir(pedido(null));
    expect(linhasParaSalvar(linhas)).toBeNull();
    expect(ajustesFeitos(linhas, nome)).toEqual([]);
  });

  it('quantidade, item retirado e item acrescentado viram texto e linhas para gravar', () => {
    const [v, m] = linhasParaConferir(pedido(null));
    const linhas: LinhaConferida[] = [{ ...v, quantidade: 2 }, { ...m, retirada: true }, { ...m, chave: 'nova-1', id: null, original: 0, quantidade: 5 }];
    expect(ajustesFeitos(linhas, nome)).toEqual(['Viatura → PMX: 3 → 2', 'Retirado: 4 × Moto → PMX', 'Acrescentado: 5 × Moto → PMX']);
    expect(linhasParaSalvar(linhas)).toEqual([
      { id: 'l1', tipo: 'ITEM', itemKey: VIATURA, kitId: null, quantidade: 2, beneficiarioId: 'b1' },
      { id: undefined, tipo: 'ITEM', itemKey: MOTO, kitId: null, quantidade: 5, beneficiarioId: 'b1' }
    ]);
  });

  it('o saldo livre da CAEP conta o que outros pedidos reservaram; só acusa a linha que subiu', () => {
    const linhas = linhasParaConferir(pedido(null));
    const fora = new Map([[VIATURA, 6]]);
    // alocado 10 − 6 de outros − 3 deste = 1 livre: subir para 4 cabe, para 5 passa.
    const subiu = (q: number) => linhas.map((l) => (l.itemKey === VIATURA ? { ...l, quantidade: q } : l));
    expect(passaDoSaldo(subiu(4)[0], livrePorItem(subiu(4), itens, fora))).toBe(false);
    expect(passaDoSaldo(subiu(5)[0], livrePorItem(subiu(5), itens, fora))).toBe(true);
    // A linha gravada que já passava (alocação diminuiu depois) não trava a conferência sem mudar a quantidade.
    expect(passaDoSaldo(linhas[0], livrePorItem(linhas, itens, new Map([[VIATURA, 9]])))).toBe(false);
  });
});

describe('ofício no prazo da minuta (migration 246)', () => {
  it('fora do prazo só quando a minuta gravou o prazo e o ofício chegou depois dele', () => {
    expect(oficioForaDoPrazo({ minutaValidaAte: '2026-11-09', oficioEm: '2026-11-10' })).toBe(true);
    expect(oficioForaDoPrazo({ minutaValidaAte: '2026-11-09', oficioEm: '2026-11-09' })).toBe(false);
    expect(oficioForaDoPrazo({ minutaValidaAte: null, oficioEm: '2026-12-01' })).toBe(false);
    expect(oficioForaDoPrazo({ minutaValidaAte: '2026-11-09', oficioEm: null })).toBe(false);
  });
});
