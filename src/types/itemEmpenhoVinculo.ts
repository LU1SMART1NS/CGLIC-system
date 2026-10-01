/** Empenho vinculado a um item da Ata (arp_item_empenhos) com os dados do empenho. */
export interface ItemEmpenhoVinculo {
  id: string;
  itemKey: string;
  empenhoId: string;
  /** Nulo = pendente de quantidade (não consome saldo). */
  quantidade: number | null;
  /** API = minuta oficial; USUARIO = confirmada pelo gestor; nulo = pendente. */
  fonte: 'API' | 'USUARIO' | null;
  /** Estimativa por valor oferecida para confirmação; nunca entra no saldo sozinha. */
  quantidadeSugerida: number | null;
  contractKey: string | null;
  numeroItemMinuta?: string;
  confirmadoEm?: string;
  empenho: {
    canonicalKey: string;
    numero: string;
    ano: number;
    uasg: string;
    dataEmissao?: string;
    valorEmpenhado: number;
    credorNome?: string;
  };
}

export type ItemEmpenhoEstado = 'OFICIAL' | 'INFORMADA' | 'PENDENTE';

export function estadoDoVinculo(v: Pick<ItemEmpenhoVinculo, 'quantidade' | 'fonte'>): ItemEmpenhoEstado {
  if (v.quantidade == null) return 'PENDENTE';
  return v.fonte === 'USUARIO' ? 'INFORMADA' : 'OFICIAL';
}
