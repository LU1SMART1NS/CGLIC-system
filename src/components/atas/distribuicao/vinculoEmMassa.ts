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

/** Uma ata provável do contrato, com os itens dela no banco (para dividir os itens do contrato entre as atas). */
export interface AtaParaPrever {
  numeroAta: string;
  uasg: string;
  itensDaAta: ItemDaAta[];
}

export interface VinculoPorAta {
  numeroAta: string;
  uasg: string;
  itens: ItemParaVincular[];
}

export type PrevisaoVariasAtas =
  | { status: 'CONFERINDO' }
  | { status: 'PRONTO'; porAta: VinculoPorAta[] }
  | { status: 'REVISAR'; motivo: string };

/**
 * Contrato em mais de uma ata da mesma compra (migration 86): cada item que a API lista no contrato vai para a ata que
 * tem esse item. Fica pronto quando nenhum item cai em duas atas; ata sem item do contrato sai do plano. Os itens já
 * vinculados (vínculo parcial) não entram de novo. Só para atas da MESMA compra do contrato (as "prováveis").
 */
export function preverVinculoVariasAtas(e: {
  atas: AtaParaPrever[];
  apiQuantidades?: Map<number, number | null> | null;
  apiCarregando?: boolean;
  apiErro?: boolean;
  /** Itens do contrato que já estão vinculados a alguma ata. */
  itensJaVinculados?: Set<number>;
}): PrevisaoVariasAtas {
  const comItens = e.atas.filter((a) => a.itensDaAta.length > 0);
  if (comItens.length === 0) return { status: 'REVISAR', motivo: e.atas.length > 1 ? 'As atas não têm itens no banco' : 'A ata não tem itens no banco' };
  if (e.apiCarregando || (!e.apiQuantidades && !e.apiErro)) return { status: 'CONFERINDO' };
  if (e.apiErro) return { status: 'REVISAR', motivo: 'A API oficial não respondeu' };
  const api = e.apiQuantidades as Map<number, number | null>;
  if (api.size === 0) return { status: 'REVISAR', motivo: 'A API oficial não lista os itens deste contrato' };

  const ja = e.itensJaVinculados ?? new Set<number>();
  const ataDoItem = new Map<number, string>();
  const porAta: VinculoPorAta[] = [];
  for (const ata of comItens) {
    const itens = ata.itensDaAta
      .filter((i) => {
        const n = parseInt(i.numeroItem, 10);
        return api.has(n) && !ja.has(n);
      })
      .map<ItemParaVincular>((i) => ({
        itemKey: normalizeItemKey(ata.numeroAta, ata.uasg, i.numeroItem),
        numeroItem: i.numeroItem,
        valorUnitario: i.valorUnitario,
        quantidade: api.get(parseInt(i.numeroItem, 10)) ?? null
      }));
    for (const i of itens) {
      const n = parseInt(i.numeroItem, 10);
      const outra = ataDoItem.get(n);
      if (outra) return { status: 'REVISAR', motivo: `O item ${n} está nas atas ${outra} e ${ata.numeroAta}: escolha a ata` };
      ataDoItem.set(n, ata.numeroAta);
    }
    if (itens.length > 0) porAta.push({ numeroAta: ata.numeroAta, uasg: ata.uasg, itens });
  }
  if (porAta.length === 0) {
    return { status: 'REVISAR', motivo: ja.size > 0 ? 'Os itens que faltam não estão nesta ata' : e.atas.length > 1 ? 'Nenhum item do contrato está nestas atas' : 'Nenhum item do contrato está nesta ata' };
  }
  return { status: 'PRONTO', porAta };
}

/** Gestor das atas envolvidas num vínculo com várias atas. */
export interface AtaComGestor {
  numeroAta: string;
  gestorNome?: string;
  /** Já vinculada (vínculo parcial): não muda de gestor por este vínculo. */
  jaVinculada?: boolean;
}

export interface EfeitoGestorVariasAtas {
  /** Atas de gestores diferentes (ou do contrato com outro gestor): o coordenador escolhe quem fica com o contrato. */
  conflito: boolean;
  /** Nomes para a escolha, o gestor atual do contrato primeiro. */
  candidatos: string[];
  textos: string[];
  atencao: boolean;
}

/**
 * Efeito no gestor quando o contrato fica em mais de uma ata (regras da migration 86). Com uma ata só, valem as regras
 * de sempre (efeitoGestorDoVinculo). Atas sem gestor assumem o gestor que fica com o contrato.
 */
export function efeitoGestorVariasAtas(gestorContrato: string | undefined, atas: AtaComGestor[]): EfeitoGestorVariasAtas {
  if (atas.length <= 1) {
    const e = efeitoGestorDoVinculo(gestorContrato, atas[0]?.gestorNome);
    return { conflito: false, candidatos: [], textos: [e.texto], atencao: e.atencao };
  }
  const nomes = new Set<string>();
  if (gestorContrato) nomes.add(gestorContrato);
  for (const a of atas) if (a.gestorNome) nomes.add(a.gestorNome);
  if (nomes.size > 1) {
    return {
      conflito: true,
      candidatos: Array.from(nomes),
      textos: atas.map((a) => `Ata ${a.numeroAta}: ${a.gestorNome || 'sem gestor'}`),
      atencao: true
    };
  }
  const [unico] = Array.from(nomes);
  if (!unico) return { conflito: false, candidatos: [], textos: ['Ainda sem gestor: atribua as atas'], atencao: false };
  const assumem = atas.filter((a) => !a.gestorNome && !a.jaVinculada);
  const textos = assumem.map((a) => `A ata ${a.numeroAta} passa a ser de ${unico}`);
  if (!gestorContrato) textos.unshift(`Passa a ser de ${unico}`);
  if (textos.length === 0) textos.push(`Já é de ${unico}`);
  return { conflito: false, candidatos: [], textos, atencao: assumem.length > 0 };
}

/**
 * Ordem de gravação das atas de um contrato, para o banco chegar ao gestor certo sem trocas no meio do caminho: com
 * gestor no contrato, primeiro as atas do mesmo gestor, depois as sem gestor (assumem o do contrato) e por último as de
 * outro gestor (o contrato, já em outra ata, fica como está); sem gestor no contrato, primeiro as com gestor (o contrato
 * herda) e depois as sem (assumem o que o contrato herdou). Com conflito, o gestor escolhido é gravado no fim.
 */
export function ordemDasAtas<T extends { gestorNome?: string }>(gestorContrato: string | undefined, atas: T[]): T[] {
  const sem = atas.filter((a) => !a.gestorNome);
  const com = atas.filter((a) => a.gestorNome);
  if (!gestorContrato) return [...com, ...sem];
  return [...com.filter((a) => a.gestorNome === gestorContrato), ...sem, ...com.filter((a) => a.gestorNome !== gestorContrato)];
}
