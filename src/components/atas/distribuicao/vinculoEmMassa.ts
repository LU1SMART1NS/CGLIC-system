import { normalizeItemKey } from '../../../utils/itemKeyUtils';

/**
 * Vínculo em massa (aba "A vincular" da Central de Distribuição): para cada contrato com uma única ata provável
 * (mesma compra e mesmo fornecedor), os itens da ata que a API oficial confirma no contrato. Só entram no lote os
 * casos claros; o resto fica para revisão e é vinculado um a um na Ata 360.
 */

export interface ItemDaAta {
  numeroItem: string;
  valorUnitario?: number;
  descricao?: string;
}

export interface ItemParaVincular {
  itemKey: string;
  numeroItem: string;
  valorUnitario?: number;
  /** Quantidade do item no contrato segundo a API (nula = a API listou o item sem quantidade). */
  quantidade: number | null;
}

export type PrevisaoVinculo =
  | { status: 'CONFERINDO' }
  | { status: 'PRONTO'; itens: ItemParaVincular[] }
  | { status: 'REVISAR'; motivo: string };

export interface EntradaPrevisao {
  numeroAta: string;
  uasg: string;
  /** Quantas atas casam por compra e fornecedor (mais de uma exige a escolha da ata). */
  atasProvaveis: number;
  itensDaAta: ItemDaAta[];
  /** Itens do contrato na API oficial (número do item → quantidade); ausente = ainda não consultado. */
  apiQuantidades?: Map<number, number | null> | null;
  apiCarregando?: boolean;
  apiErro?: boolean;
  /**
   * A ata é de outra compra. A API devolve os números dos itens na compra do contrato, que só coincidem com os
   * números dos itens da ata quando a compra é a mesma; em outra compra o "item 1" de um não é o "item 1" do outro.
   */
  compraDiferente?: boolean;
}

export function preverVinculo(e: EntradaPrevisao): PrevisaoVinculo {
  if (e.atasProvaveis > 1) return { status: 'REVISAR', motivo: 'Mais de uma ata provável: escolha a ata' };
  if (e.itensDaAta.length === 0) return { status: 'REVISAR', motivo: 'A ata não tem itens no banco' };
  if (e.compraDiferente) return { status: 'REVISAR', motivo: 'A ata é de outra compra: a API não tem como confirmar os itens' };
  if (e.apiCarregando || (!e.apiQuantidades && !e.apiErro)) return { status: 'CONFERINDO' };
  if (e.apiErro) return { status: 'REVISAR', motivo: 'A API oficial não respondeu' };
  const api = e.apiQuantidades as Map<number, number | null>;
  if (api.size === 0) return { status: 'REVISAR', motivo: 'A API oficial não lista os itens deste contrato' };

  const itens = e.itensDaAta
    .filter((i) => api.has(parseInt(i.numeroItem, 10)))
    .map<ItemParaVincular>((i) => ({
      itemKey: normalizeItemKey(e.numeroAta, e.uasg, i.numeroItem),
      numeroItem: i.numeroItem,
      valorUnitario: i.valorUnitario,
      quantidade: api.get(parseInt(i.numeroItem, 10)) ?? null
    }));
  if (itens.length === 0) return { status: 'REVISAR', motivo: 'Nenhum item do contrato está nesta ata' };
  return { status: 'PRONTO', itens };
}

/** O que acontece com o gestor quando o contrato é vinculado à ata (regras das migrations 69 e 70). */
export type TipoEfeitoGestor = 'HERDA' | 'MUDA' | 'IGUAL' | 'ATA_ASSUME' | 'SEM_GESTOR';

export interface EfeitoGestor {
  tipo: TipoEfeitoGestor;
  texto: string;
  /** Muda o gestor de alguém: o coordenador deve olhar antes de confirmar. */
  atencao: boolean;
}

export function efeitoGestorDoVinculo(gestorContrato?: string, gestorAta?: string): EfeitoGestor {
  if (gestorAta && !gestorContrato) return { tipo: 'HERDA', texto: `Passa a ser de ${gestorAta}`, atencao: false };
  if (gestorAta && gestorContrato && gestorAta !== gestorContrato) {
    return { tipo: 'MUDA', texto: `Passa de ${gestorContrato} para ${gestorAta}`, atencao: true };
  }
  if (gestorAta && gestorContrato) return { tipo: 'IGUAL', texto: `Já é de ${gestorAta}`, atencao: false };
  if (!gestorAta && gestorContrato) return { tipo: 'ATA_ASSUME', texto: `A ata passa a ser de ${gestorContrato}`, atencao: true };
  return { tipo: 'SEM_GESTOR', texto: 'Ainda sem gestor: atribua a ata', atencao: false };
}

/** Número do item sem os zeros à esquerda ("00009" → "9"). */
export const semZeros = (numero: string): string => numero.replace(/^0+/, '') || '0';

/** "Item 3 – Qtd contratada 200": a quantidade que a API oficial informa para o item no contrato. */
export function textoItemQtd(i: { numeroItem: string; quantidade: number | null }): string {
  const qtd = i.quantidade != null ? i.quantidade.toLocaleString('pt-BR') : 'não informada';
  return `Item ${semZeros(i.numeroItem)} – Qtd contratada ${qtd}`;
}
