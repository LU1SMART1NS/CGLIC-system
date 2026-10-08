import { quantidadeBaseSenasp } from './quantitativoSenasp';
import { normalizeAtaNumber } from './itemKeyUtils';
import {
  agregarNivel,
  nivelAlocacao,
  nivelEmpenho,
  type NivelAtendimento
} from './itemAtendimento';
import type { PrazoFaixa } from '../components/carteira/carteiraPrazo';
import type { CarteiraItemEmpenho, CarteiraItemLink } from '../services/carteiraItensService';
import type { GlobalAllocationRecord } from '../services/allocationService';
import type { ArpItemRecord, ArpRecord } from '../types';

/** Uma linha da aba Itens: o item da ata com prazo da ata, alocação por unidade e empenho. */
export interface CarteiraItemRow {
  /** Identificador estável da linha: "{numeroAta}-{uasg}-{numeroItem}" (a mesma chave do item no resto do sistema). */
  key: string;
  ataKey: string;
  arp: ArpRecord;
  item: ArpItemRecord;
  gestorNome?: string;
  diasRestantes: number | null;
  faixa: PrazoFaixa;
  /** Base do saldo: quantitativo SENASP do item. */
  quantitativoSenasp: number;
  /** Percentual do quantitativo SENASP já consumido (nulo sem saldo sincronizado). */
  consumoPct: number | null;
  /** Total alocado às unidades internas e a parte de cada unidade (chave = nome normalizado). */
  alocado: number;
  alocadoPorUnidade: Record<string, number>;
  nivelAlocacao: NivelAtendimento;
  /** Soma da quantidade do item nos contratos vinculados; nula quando nenhum vínculo tem a quantidade lida. */
  contratada: number | null;
  /** Soma das parcelas deste item nas notas vinculadas aos itens dos contratos (em unidades). */
  empenhado: number;
  nivelEmpenho: NivelAtendimento;
}

/** Resumo de uma ata a partir dos itens: usado pelos filtros de alocação, empenho e unidade na carteira de Atas. */
export interface CarteiraAtaExecucao {
  itens: number;
  nivelAlocacao: NivelAtendimento | null;
  nivelEmpenho: NivelAtendimento | null;
  /** Chaves (normalizadas) das unidades que receberam alguma alocação em itens da ata. */
  unidades: Set<string>;
}

export interface CarteiraItensInput {
  arps: ArpRecord[];
  itemsByAta: Record<string, ArpItemRecord[]>;
  gestorByAta: Record<string, string>;
  /** Linhas de arp_item_saldos (view v_arp_item_saldo_detalhado), das duas UASGs. */
  saldos: any[];
  allocations: GlobalAllocationRecord[];
  links: CarteiraItemLink[];
  empenhos: CarteiraItemEmpenho[];
  prazoOf: (arp: ArpRecord) => { dias: number | null; faixa: PrazoFaixa };
}

/** Nome de unidade comparável: sem diferença de caixa ou espaços. */
export function normalizarUnidade(nome?: string | null): string {
  return (nome || '').trim().toLowerCase();
}

/** Chave comparável de item: ignora zeros à esquerda no número da ata e do item ("37/2026" = "00037/2026", "1" = "00001"). */
export function chaveItem(numeroAta: string, uasg: string, numeroItem: string | number): string {
  const n = Number.parseInt(String(numeroItem), 10);
  return `${normalizeAtaNumber(numeroAta)}|${uasg}|${Number.isFinite(n) ? n : String(numeroItem)}`;
}

/** Desmonta "{numeroAta}-{uasg}-{numeroItem}" (o número da ata pode conter hífens). */
export function chaveItemDeItemKey(itemKey: string): string | null {
  const match = /^(.+)-(\d{6})-(\d+)$/.exec((itemKey || '').trim());
  return match ? chaveItem(match[1], match[2], match[3]) : null;
}

function somar<T>(mapa: Map<string, T[]>, chave: string, valor: T) {
  const lista = mapa.get(chave);
  if (lista) lista.push(valor);
  else mapa.set(chave, [valor]);
}

export function buildCarteiraItemRows(input: CarteiraItensInput): CarteiraItemRow[] {
  const { arps, itemsByAta, gestorByAta, saldos, allocations, links, empenhos, prazoOf } = input;

  const saldoPorItem = new Map<string, any>();
  for (const s of saldos) {
    const ata = s.numero_ata ?? s.numeroAta;
    const uasg = s.codigo_uasg ?? s.codigoUasg;
    const item = s.numero_item ?? s.numeroItem;
    if (ata == null || uasg == null || item == null) continue;
    saldoPorItem.set(chaveItem(String(ata), String(uasg), item), s);
  }

  const alocacoesPorItem = new Map<string, GlobalAllocationRecord[]>();
  for (const a of allocations) {
    const chave = chaveItemDeItemKey(a.itemKey);
    if (chave) somar(alocacoesPorItem, chave, a);
  }

  const contratadaPorItem = new Map<string, number | null>();
  for (const l of links) {
    const chave = chaveItemDeItemKey(l.itemKey);
    if (!chave) continue;
    const atual = contratadaPorItem.get(chave);
    if (l.quantidadeContratada == null) {
      if (atual === undefined) contratadaPorItem.set(chave, null);
    } else {
      contratadaPorItem.set(chave, (atual ?? 0) + l.quantidadeContratada);
    }
  }

  const empenhadoPorItem = new Map<string, number>();
  for (const e of empenhos) {
    const chave = chaveItemDeItemKey(e.itemKey);
    if (!chave) continue;
    empenhadoPorItem.set(chave, (empenhadoPorItem.get(chave) ?? 0) + e.quantidade);
  }

  const rows: CarteiraItemRow[] = [];
  for (const arp of arps) {
    const numeroAta = arp.numeroAtaRegistroPreco;
    const uasg = arp.codigoUnidadeGerenciadora;
    const ataKey = `${numeroAta}-${uasg}`;
    const { dias, faixa } = prazoOf(arp);

    for (const item of itemsByAta[ataKey] || []) {
      const chave = chaveItem(numeroAta, uasg, item.numeroItem);
      const saldo = saldoPorItem.get(chave);
      const senasp = saldo ? quantidadeBaseSenasp(saldo) : Number(item.quantidadeHomologadaItem) || 0;
      const rawPct = saldo && typeof saldo.percentual_consumido === 'number' ? saldo.percentual_consumido : null;

      const alocadoPorUnidade: Record<string, number> = {};
      let alocado = 0;
      for (const a of alocacoesPorItem.get(chave) || []) {
        const unidade = normalizarUnidade(a.unitName);
        const qtd = Number(a.allocatedQty) || 0;
        if (!unidade || qtd <= 0) continue;
        alocadoPorUnidade[unidade] = (alocadoPorUnidade[unidade] ?? 0) + qtd;
        alocado += qtd;
      }

      const contratada = contratadaPorItem.has(chave) ? contratadaPorItem.get(chave) ?? null : null;
      const empenhado = empenhadoPorItem.get(chave) ?? 0;

      rows.push({
        key: `${ataKey}-${item.numeroItem}`,
        ataKey,
        arp,
        item,
        gestorNome: gestorByAta[numeroAta],
        diasRestantes: dias,
        faixa,
        quantitativoSenasp: senasp,
        consumoPct: rawPct,
        alocado,
        alocadoPorUnidade,
        nivelAlocacao: nivelAlocacao(alocado, senasp),
        contratada,
        empenhado,
        nivelEmpenho: nivelEmpenho(empenhado, contratada)
      });
    }
  }
  return rows;
}

/** Resumo por ata (chave "{numeroAta}-{uasg}") a partir das linhas de itens. */
export function resumirAtas(rows: CarteiraItemRow[]): Map<string, CarteiraAtaExecucao> {
  const porAta = new Map<string, CarteiraItemRow[]>();
  for (const r of rows) somar(porAta, r.ataKey, r);

  const resumo = new Map<string, CarteiraAtaExecucao>();
  for (const [ataKey, itens] of porAta) {
    const unidades = new Set<string>();
    for (const r of itens) for (const u of Object.keys(r.alocadoPorUnidade)) unidades.add(u);
    resumo.set(ataKey, {
      itens: itens.length,
      nivelAlocacao: agregarNivel(itens.map((r) => r.nivelAlocacao)),
      nivelEmpenho: agregarNivel(itens.map((r) => r.nivelEmpenho)),
      unidades
    });
  }
  return resumo;
}

/** Unidades internas de cada contrato: as que receberam alocação de algum item vinculado ao contrato. */
export function unidadesPorContrato(
  links: CarteiraItemLink[],
  allocations: GlobalAllocationRecord[]
): Map<string, Set<string>> {
  const unidadesPorItem = new Map<string, Set<string>>();
  for (const a of allocations) {
    const chave = chaveItemDeItemKey(a.itemKey);
    const unidade = normalizarUnidade(a.unitName);
    if (!chave || !unidade || !(Number(a.allocatedQty) > 0)) continue;
    const set = unidadesPorItem.get(chave) ?? new Set<string>();
    set.add(unidade);
    unidadesPorItem.set(chave, set);
  }

  const resultado = new Map<string, Set<string>>();
  for (const l of links) {
    const chave = chaveItemDeItemKey(l.itemKey);
    const unidades = chave ? unidadesPorItem.get(chave) : undefined;
    if (!unidades) continue;
    const set = resultado.get(l.contractKey) ?? new Set<string>();
    unidades.forEach((u) => set.add(u));
    resultado.set(l.contractKey, set);
  }
  return resultado;
}

/** Unidades internas distintas (nome para exibir, na grafia da primeira alocação), em ordem alfabética. */
export function listarUnidades(allocations: GlobalAllocationRecord[]): Array<{ chave: string; nome: string }> {
  const mapa = new Map<string, string>();
  for (const a of allocations) {
    const chave = normalizarUnidade(a.unitName);
    if (chave && !mapa.has(chave)) mapa.set(chave, a.unitName.trim());
  }
  return Array.from(mapa, ([chave, nome]) => ({ chave, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
