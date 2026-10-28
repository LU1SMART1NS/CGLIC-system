import { describe, it, expect } from 'vitest';
import type { ItemCaep, LinhaPedido, PedidoEmenda } from '../../services/emendasService';
import type { PrecoPrevisto } from '../../services/emendasQuadroService';
import {
  ajustesFeitos,
  linhasParaConferir,
  linhasParaSalvar,
  livrePorItem,
  passaDoSaldo,
  precosDaMinuta,
  precosQueMudaram,
  precoUnitarioDaMinuta,
  valorPelaMinuta,
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
const previsto = (itemKey: string, precoPrevisto: number): [string, PrecoPrevisto] => [
  itemKey,
  { itemKey, precoAtual: precoPrevisto, precoPrevisto, motivo: 'SEM_PREVISAO', devido: false, efeito: null, percentual: null, mesesEstimados: null }
];

describe('conferência do ofício: valor pelos preços da minuta (migration 234)', () => {
  it('a minuta guarda o preço previsto de cada item, e a conferência soma por ele', () => {
    const precos = new Map([previsto(VIATURA, 300000), previsto(MOTO, 40000)]);
    const p = pedido(null);
    expect(precosDaMinuta(p, itens, precos)).toEqual({ [VIATURA]: 300000, [MOTO]: 40000 });
    const comMinuta = pedido({ [VIATURA]: 300000, [MOTO]: 40000 });
    expect(valorPelaMinuta(linhasParaConferir(comMinuta), comMinuta, itens, precos)).toBe(1060000);
  });

  it('sem preços da minuta (registrada antes da 234), vale o preço previsto de hoje', () => {
    const p = pedido(null);
    expect(valorPelaMinuta(linhasParaConferir(p), p, itens)).toBe(3 * 298000 + 4 * 38500);
  });

  it('o preço que mudou depois da minuta aparece com a ata; a linha acrescentada usa o preço de hoje e não acusa', () => {
    const precos = new Map([previsto(VIATURA, 310000), previsto(MOTO, 38500)]);
    const p = pedido({ [VIATURA]: 298000, [MOTO]: 38500 });
    const linhas = linhasParaConferir(p);
    expect(precosQueMudaram(linhas, p, itens, precos)).toEqual([{ itemKey: VIATURA, numeroAta: '00102/2024', naMinuta: 298000, hoje: 310000 }]);
    const nova: LinhaConferida = { ...linhas[0], chave: 'nova-1', id: null, original: 0, quantidade: 1 };
    expect(precoUnitarioDaMinuta(nova, p, itens, precos)).toBe(310000);
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
