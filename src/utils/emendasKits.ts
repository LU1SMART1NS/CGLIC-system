/**
 * Situação de cada kit das emendas, calculada (protótipo aprovado em 23/10/2026): ninguém inativa à mão por
 * causa de ata vencida. O kit não guarda saldo; os kits possíveis vêm do item que tem menos saldo.
 *
 * Entrega 1: saldo do item = alocado à CAEP. Na entrega 2 os pedidos dos parlamentares saem desse saldo.
 */
import type { ItemCaep, KitEmenda } from '../services/emendasService';

/** Dias antes do fim da ata em que o kit passa a "Vence em breve" (decisão de 23/10/2026). */
export const AVISO_VENCIMENTO_DIAS = 60;

export type SituacaoKit = 'disponivel' | 'vence' | 'indisponivel' | 'desativado';

export interface ComponenteDoKit {
  itemKey: string;
  quantidade: number;
  item: ItemCaep | null;
  saldo: number;
  /** Quantos kits este item sozinho permite. */
  kits: number;
  diasParaVencer: number | null;
}

export interface CalculoDoKit {
  situacao: SituacaoKit;
  motivo: string;
  kitsPossiveis: number;
  valorPorKit: number;
  componentes: ComponenteDoKit[];
  /** Item que trava ou vai travar o kit (ata encerrada, sem saldo ou ata vencendo). */
  itemLimitante: ComponenteDoKit | null;
}

const UM_DIA = 86_400_000;

/** Descrição curta para frases: corta em n letras sem deixar vírgula ou espaço no fim. */
export function curto(texto: string, n = 40): string {
  return texto.length <= n ? texto : texto.slice(0, n).replace(/[\s,;.:-]+$/, '') + '…';
}

export function diasEntre(hoje: string, fim: string): number {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / UM_DIA);
}

export function dataBR(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';
}

export function rotuloDoItem(item: ItemCaep | null, itemKey: string): string {
  if (!item) return `item ${itemKey} (sem alocação da CAEP)`;
  return `${curto(item.descricao, 50)} (ata ${item.numeroAta}, item ${Number(item.numeroItem)})`;
}

export function calcularKit(
  kit: Pick<KitEmenda, 'ativo' | 'itens'>,
  itens: Map<string, ItemCaep>,
  hoje: string,
  saldoDoItem: (item: ItemCaep) => number = (i) => i.alocado
): CalculoDoKit {
  const componentes: ComponenteDoKit[] = kit.itens.map((c) => {
    const item = itens.get(c.itemKey) ?? null;
    const saldo = item ? saldoDoItem(item) : 0;
    return {
      itemKey: c.itemKey,
      quantidade: c.quantidade,
      item,
      saldo,
      kits: item && !item.ataEncerrada ? Math.max(0, Math.floor(saldo / c.quantidade)) : 0,
      diasParaVencer: item?.vigenciaFinal ? diasEntre(hoje, item.vigenciaFinal) : null
    };
  });
  const valorPorKit = componentes.reduce((s, c) => s + (c.item ? c.item.valorUnitario * c.quantidade : 0), 0);
  const kitsPossiveis = componentes.length ? Math.min(...componentes.map((c) => c.kits)) : 0;
  const base = { kitsPossiveis, valorPorKit, componentes };

  if (!kit.ativo) return { ...base, situacao: 'desativado', motivo: 'Desativado pela CAEP.', itemLimitante: null };

  const semAlocacao = componentes.find((c) => !c.item);
  if (semAlocacao) {
    return { ...base, kitsPossiveis: 0, situacao: 'indisponivel', motivo: `O item ${semAlocacao.itemKey} não tem mais alocação da CAEP.`, itemLimitante: semAlocacao };
  }
  const encerrado = componentes.find((c) => c.item?.ataEncerrada);
  if (encerrado) {
    return {
      ...base,
      kitsPossiveis: 0,
      situacao: 'indisponivel',
      motivo: `A ata ${encerrado.item!.numeroAta} (${curto(encerrado.item!.descricao)}) encerrou em ${dataBR(encerrado.item!.vigenciaFinal)}. Troque o item ou espere a prorrogação.`,
      itemLimitante: encerrado
    };
  }
  const limitante = componentes.reduce<ComponenteDoKit | null>((m, c) => (m == null || c.kits < m.kits ? c : m), null);
  if (kitsPossiveis === 0 && limitante) {
    return { ...base, situacao: 'indisponivel', motivo: `Sem saldo de ${curto(limitante.item!.descricao)} para um kit.`, itemLimitante: limitante };
  }
  const vencendo = componentes
    .filter((c) => c.diasParaVencer != null && c.diasParaVencer <= AVISO_VENCIMENTO_DIAS)
    .sort((a, b) => (a.diasParaVencer ?? 0) - (b.diasParaVencer ?? 0))[0];
  if (vencendo) {
    return {
      ...base,
      situacao: 'vence',
      motivo: `A ata ${vencendo.item!.numeroAta} (${curto(vencendo.item!.descricao)}) vence em ${dataBR(vencendo.item!.vigenciaFinal)}, daqui a ${vencendo.diasParaVencer} dias. Pedidos novos precisam ser empenhados até lá.`,
      itemLimitante: vencendo
    };
  }
  return { ...base, situacao: 'disponivel', motivo: '', itemLimitante: limitante };
}

/** Itens de ata vigente com alocação da CAEP e o mesmo código de material (PDM): sugestão para trocar o item. */
export function sugestoesDeTroca(item: ItemCaep, itens: ItemCaep[]): ItemCaep[] {
  if (item.codigoPdm == null) return [];
  return itens.filter((i) => i.itemKey !== item.itemKey && !i.ataEncerrada && i.codigoPdm === item.codigoPdm);
}

export const ROTULO_SITUACAO_KIT: Record<SituacaoKit, string> = {
  disponivel: 'Disponível',
  vence: 'Vence em breve',
  indisponivel: 'Indisponível',
  desativado: 'Desativado'
};
