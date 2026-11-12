/**
 * Situação de cada kit das emendas, calculada (protótipo aprovado em 23/10/2026): ninguém inativa à mão por
 * causa de ata vencida. O kit não guarda saldo; os kits possíveis vêm do item que tem menos saldo.
 *
 * Entrega 1: saldo do item = alocado à CAEP. Na entrega 2 os pedidos dos parlamentares saem desse saldo.
 */
import type { ItemCaep, KitEmenda, LinhaPedido } from '../services/emendasService';
import type { PrecoDoItem } from '../services/emendasQuadroService';
import { descricaoItemEmFrase } from './textCase';
import { EMENDAS_RULES } from '../config/alertRules';
import { podeReservar, reajusteDoItem } from './emendasReajuste';

/** Dias antes do fim da ata em que o kit e o pedido avisam (Ajustes; padrão 90). Lido na hora, nunca copiado. */
export const avisoIndicacaoDias = (): number => EMENDAS_RULES.avisoIndicacaoAntesDias;
/** A menos destes dias do fim da ata não se recebe indicação (Ajustes; padrão 60; o banco confere, migrations 162 e 246). */
export const corteIndicacaoDias = (): number => EMENDAS_RULES.corteIndicacaoAntesDias;

/** Último dia para receber indicação com itens da ata: fim da vigência menos o corte. */
export function limiteDaIndicacao(vigenciaFinal: string): string {
  return new Date(Date.parse(`${vigenciaFinal}T00:00:00Z`) - corteIndicacaoDias() * 86_400_000).toISOString().slice(0, 10);
}

/** A ata já passou do corte: o sistema não aceita nova reserva nem ofício com o item. */
export const passouDoCorte = (diasParaVencer: number | null): boolean => diasParaVencer != null && diasParaVencer < corteIndicacaoDias();

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
  /** Valor de um kit pelo preço de hoje das atas (o da emenda). */
  valorPorKit: number;
  componentes: ComponenteDoKit[];
  /** Item que trava ou vai travar o kit (ata encerrada, sem saldo ou ata vencendo). */
  itemLimitante: ComponenteDoKit | null;
}

const UM_DIA = 86_400_000;

/** Descrição curta para frases: corta em n letras sem deixar vírgula ou espaço no fim. */
export function curto(texto: string, n = 40): string {
  const t = descricaoItemEmFrase(texto);
  return t.length <= n ? t : t.slice(0, n).replace(/[\s,;.:-]+$/, '') + '…';
}

/** Até onde vai o nome do item nas listas de Emendas; o nome inteiro fica no quadro do ofício e nas telas 360. */
export const NOME_NA_LISTA = 40;

/**
 * Nome do item da ata assinada nas listas: alguns vieram com a descrição técnica inteira (até 372 letras, 30/10/2026),
 * então passa de 40 letras é cortado no fim de uma palavra, com "…". O nome inteiro vai no `title` da célula.
 */
export function nomeNaLista(nome: string, n = NOME_NA_LISTA): string {
  const t = nome.trim().replace(/\s+/g, ' ');
  if (t.length <= n) return t;
  const ate = t.slice(0, n + 1);
  const noFimDaPalavra = ate.includes(' ') ? ate.replace(/\s+\S*$/, '') : t.slice(0, n);
  return noFimDaPalavra.replace(/[\s,;.:(\-/]+$/, '') + '…';
}

/**
 * A linha do pedido nas listas ("2 Pistola 9 mm"): o item pelo nome da ata assinada (nome curto da CAEP, o mesmo do
 * quadro do gabinete), cortado em 40 letras; sem ele, o começo da descrição do catálogo. O kit, pelo nome do kit.
 */
export function nomeDaLinhaDoPedido(l: Pick<LinhaPedido, 'tipo' | 'quantidade' | 'itemKey' | 'kitNome'>, itens: Map<string, ItemCaep>, limite = 34): string {
  if (l.tipo === 'KIT') return `${l.quantidade} ${l.kitNome ?? 'kit'}`;
  const item = itens.get(l.itemKey ?? '');
  const nome = item?.nomeCurto?.trim();
  return `${l.quantidade} ${nome ? nomeNaLista(nome) : curto(item?.descricao ?? l.itemKey ?? '', limite)}`;
}

export function diasEntre(hoje: string, fim: string): number {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / UM_DIA);
}

/** Item como na Carteira de Itens: "00001 · Ata 00031/2025". */
export function rotuloItemDaAta(i: { numeroAta: string; numeroItem: string }): string {
  return `${String(i.numeroItem).padStart(5, '0')} · Ata ${i.numeroAta}`;
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
  saldoDoItem: (item: ItemCaep) => number = (i) => i.alocado,
  precos?: Map<string, PrecoDoItem>
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
  const soma = (preco: (k: string) => number) => Math.round(componentes.reduce((s, c) => s + (c.item ? preco(c.itemKey) * c.quantidade : 0), 0) * 100) / 100;
  // A mesma regra de precoParaEmenda (emendasPedidos, que importa daqui).
  const valorPorKit = soma((k) => precos?.get(k)?.precoAtual ?? itens.get(k)?.valorUnitario ?? 0);
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
  const noCorte = componentes.filter((c) => passouDoCorte(c.diasParaVencer)).sort((a, b) => (a.diasParaVencer ?? 0) - (b.diasParaVencer ?? 0))[0];
  if (noCorte) {
    return {
      ...base,
      kitsPossiveis: 0,
      situacao: 'indisponivel',
      motivo: `A ata ${noCorte.item!.numeroAta} (${curto(noCorte.item!.descricao)}) termina em ${dataBR(noCorte.item!.vigenciaFinal)}: passou do prazo de indicação (${corteIndicacaoDias()} dias antes do fim). Troque o item ou espere a prorrogação.`,
      itemLimitante: noCorte
    };
  }
  // Item perto do reajuste da ata (ou com o reajuste devido) não entra em reserva nova (migration 246).
  const noReajuste = componentes
    .map((c) => ({ c, r: reajusteDoItem(precos?.get(c.itemKey), hoje) }))
    .find((x) => !podeReservar(x.r));
  if (noReajuste) {
    return {
      ...base,
      kitsPossiveis: 0,
      situacao: 'indisponivel',
      motivo: `A ata ${noReajuste.c.item!.numeroAta} (${curto(noReajuste.c.item!.descricao)}): ${noReajuste.r.rotulo!.charAt(0).toLowerCase()}${noReajuste.r.rotulo!.slice(1)}. ${noReajuste.r.detalhe}`,
      itemLimitante: noReajuste.c
    };
  }
  const limitante = componentes.reduce<ComponenteDoKit | null>((m, c) => (m == null || c.kits < m.kits ? c : m), null);
  if (kitsPossiveis === 0 && limitante) {
    return { ...base, situacao: 'indisponivel', motivo: `Sem saldo de ${curto(limitante.item!.descricao)} para um kit.`, itemLimitante: limitante };
  }
  const vencendo = componentes
    .filter((c) => c.diasParaVencer != null && c.diasParaVencer <= avisoIndicacaoDias())
    .sort((a, b) => (a.diasParaVencer ?? 0) - (b.diasParaVencer ?? 0))[0];
  if (vencendo) {
    return {
      ...base,
      situacao: 'vence',
      motivo: `A ata ${vencendo.item!.numeroAta} (${curto(vencendo.item!.descricao)}) vence em ${dataBR(vencendo.item!.vigenciaFinal)}, daqui a ${vencendo.diasParaVencer} dias. Indicação só até ${dataBR(limiteDaIndicacao(vencendo.item!.vigenciaFinal!))}: o contrato precisa ser assinado antes do fim da ata.`,
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

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Busca pela descrição, pelo número da ata ("31/2025", "00031") ou do item ("item 2"). Todas as palavras precisam aparecer. */
export function buscarItensCaep(itens: ItemCaep[], texto: string): ItemCaep[] {
  let t = semAcento(texto.trim());
  // "item 2" vale como número exato do item, não como as palavras "item" e "2".
  const numeroItem = t.match(/\bitem\s*(\d+)\b/);
  if (numeroItem) t = t.replace(numeroItem[0], ' ');
  const palavras = t.split(/\s+/).filter(Boolean);
  if (palavras.length === 0 && !numeroItem) return itens;
  return itens.filter((i) => {
    if (numeroItem && Number(i.numeroItem) !== Number(numeroItem[1])) return false;
    const [num, ano] = i.numeroAta.split('/');
    const alvo = semAcento(`${i.descricao} ${i.numeroAta} ${Number(num)}/${ano ?? ''}`);
    return palavras.every((p) => alvo.includes(p));
  });
}
