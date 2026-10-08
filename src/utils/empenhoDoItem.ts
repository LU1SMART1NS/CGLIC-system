import type { DistribuicaoDoEmpenho } from '../services/distribuicaoEmpenhoService';

/**
 * Empenho de um item da ata a partir do vínculo das notas aos itens do contrato (migration 94). O item da ata
 * corresponde ao item do contrato com o mesmo número; só notas com vínculo fechado (DISTRIBUIDA) contam no empenhado.
 * Substitui a cópia antiga por item (arp_item_empenhos), que punha toda nota do contrato em todos os itens.
 */

/** Parte de uma nota vinculada a este item. */
export interface ParcelaDoItem {
  contratoEmpenhoId: string;
  contractKey: string;
  empenhoId: string;
  numeroOficial: string;
  dataEmissao: string | null;
  uasgEmitente: string | null;
  /** Valor da nota que foi para este item. */
  valor: number;
  /** Valor ÷ preço unitário do item no contrato; nulo sem preço (ex.: serviço). */
  quantidade: number | null;
  origem: 'AUTO' | 'USUARIO' | null;
  vinculadaPorNome: string | null;
  vinculadaEm: string | null;
}

/** Execução do item em UM contrato. */
export interface ExecucaoNoContrato {
  contractKey: string;
  parcelas: ParcelaDoItem[];
  /** Soma das quantidades das parcelas (as sem preço não entram). */
  empenhado: number;
  valorEmpenhado: number;
  /** Notas do contrato ainda a vincular (ou a rever) que podem conter este item. */
  aVincular: DistribuicaoDoEmpenho[];
  /** Notas a vincular cuja única sugestão é outro item do contrato. */
  deOutroItem: DistribuicaoDoEmpenho[];
  /** O contrato não tem itens numerados na fonte: as notas ficam no contrato inteiro, sem divisão por item. */
  semItens: boolean;
  /** Valor das notas do contrato sem divisão por item (só referência, não conta no empenhado). */
  valorSemDivisao: number;
}

export interface EmpenhoDoItem {
  porContrato: Map<string, ExecucaoNoContrato>;
  parcelas: ParcelaDoItem[];
  empenhado: number;
  aVincular: DistribuicaoDoEmpenho[];
  /** Contratos vinculados sem itens na fonte. */
  contratosSemItens: number;
}

const EPS = 0.005;
const vazio = (contractKey: string): ExecucaoNoContrato => ({
  contractKey,
  parcelas: [],
  empenhado: 0,
  valorEmpenhado: 0,
  aVincular: [],
  deOutroItem: [],
  semItens: false,
  valorSemDivisao: 0
});

/**
 * A nota a vincular pode conter este item? Só não pode quando a sugestão é única e aponta para outro item (igual ao
 * total ou múltiplo do preço de um item só). Várias possibilidades ou sem sugestão: pode.
 */
export function podeConterItem(d: Pick<DistribuicaoDoEmpenho, 'sugestaoTipo' | 'sugestao'>, numeroItem: number): boolean {
  const unica = (d.sugestaoTipo === 'TOTAL_DO_ITEM' || d.sugestaoTipo === 'MULTIPLO_DO_PRECO') && d.sugestao.length === 1;
  if (!unica) return true;
  return d.sugestao[0].numeroItem === numeroItem;
}

/** Mais recentes primeiro; empate (ou sem data) pelo número da nota. */
function maisRecenteDepois(a: { dataEmissao: string | null; numeroOficial: string }, b: { dataEmissao: string | null; numeroOficial: string }): number {
  return (b.dataEmissao ?? '').localeCompare(a.dataEmissao ?? '') || a.numeroOficial.localeCompare(b.numeroOficial);
}

/** Monta a execução do item em cada contrato vinculado, a partir das notas de cada contrato. */
export function montarEmpenhoDoItem(input: {
  numeroItem: number;
  contratos: Array<{ contractKey: string; valorUnitario: number | null | undefined; distribuicoes: DistribuicaoDoEmpenho[] }>;
}): EmpenhoDoItem {
  const porContrato = new Map<string, ExecucaoNoContrato>();
  for (const c of input.contratos) {
    const e = vazio(c.contractKey);
    const vu = c.valorUnitario && c.valorUnitario > 0 ? c.valorUnitario : null;
    for (const d of c.distribuicoes) {
      if (d.situacao === 'SEM_ITENS') {
        e.semItens = true;
        e.valorSemDivisao += d.valorNota;
        continue;
      }
      if (d.situacao === 'DISTRIBUIDA') {
        const valor = d.parcelas.filter((p) => p.numeroItem === input.numeroItem).reduce((s, p) => s + p.valor, 0);
        if (valor <= EPS) continue;
        const quantidade = vu ? valor / vu : null;
        e.parcelas.push({
          contratoEmpenhoId: d.contratoEmpenhoId,
          contractKey: c.contractKey,
          empenhoId: d.empenhoId,
          numeroOficial: d.numeroOficial,
          dataEmissao: d.dataEmissao,
          uasgEmitente: d.uasgEmitente,
          valor,
          quantidade,
          origem: d.origem,
          vinculadaPorNome: d.distribuidoPorNome,
          vinculadaEm: d.distribuidoEm
        });
        e.valorEmpenhado += valor;
        if (quantidade != null) e.empenhado += quantidade;
        continue;
      }
      if (d.situacao === 'A_DISTRIBUIR' || d.situacao === 'REVISAR') {
        (podeConterItem(d, input.numeroItem) ? e.aVincular : e.deOutroItem).push(d);
      }
    }
    // Ordem fixa: o banco devolve as notas sem ordem e a posição delas muda quando uma é atualizada (ao definir a
    // quantidade), então desempata pelo número da nota para a linha não pular de lugar.
    e.parcelas.sort(maisRecenteDepois);
    e.aVincular.sort(maisRecenteDepois);
    e.deOutroItem.sort(maisRecenteDepois);
    porContrato.set(c.contractKey, e);
  }
  const todas = [...porContrato.values()];
  return {
    porContrato,
    parcelas: todas.flatMap((e) => e.parcelas),
    empenhado: todas.reduce((s, e) => s + e.empenhado, 0),
    aVincular: todas.flatMap((e) => e.aVincular),
    contratosSemItens: todas.filter((e) => e.semItens).length
  };
}
