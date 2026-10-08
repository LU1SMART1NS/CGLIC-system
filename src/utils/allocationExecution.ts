import { normalizeEmpenhoNumero } from '../services/empenhoNormalizationService';
import type { EmpenhoDoItem } from './empenhoDoItem';

/** Execução de uma alocação interna: o que a unidade empenhou, pelas parcelas deste item nas notas ligadas a ela. */
export interface AllocationExecution {
  /** Soma das quantidades das parcelas deste item nas notas ligadas à unidade. */
  empenhado: number;
  /** Notas do item ligadas à unidade, vinculadas aos itens ou ainda a vincular (impedem remover a unidade). */
  vinculados: number;
}

export interface AllocationExecutionSummary {
  porAlocacao: Map<string, AllocationExecution>;
  /** Parcelas deste item em notas que ainda não foram ligadas a nenhuma unidade interna. */
  semUnidade: { empenhado: number; count: number };
}

/**
 * Cruza o empenho do item (parcelas das notas vinculadas aos itens e notas ainda a vincular) com a ligação
 * nota → unidade interna (empenho_links, guardada pelo número da nota; a comparação ignora zeros e separadores).
 */
export function summarizeAllocationExecution(
  allocations: Array<{ id: string }>,
  empenho: Pick<EmpenhoDoItem, 'parcelas' | 'aVincular'>,
  empenhoLinks: Record<string, string>
): AllocationExecutionSummary {
  const validIds = new Set(allocations.map((a) => a.id));
  const unitByNumero = new Map<string, string>();
  for (const [numero, allocationId] of Object.entries(empenhoLinks)) {
    if (allocationId && validIds.has(allocationId)) unitByNumero.set(normalizeEmpenhoNumero(numero), allocationId);
  }

  const porAlocacao = new Map<string, AllocationExecution>(allocations.map((a) => [a.id, { empenhado: 0, vinculados: 0 }]));
  const semUnidade = { empenhado: 0, count: 0 };
  const contadas = new Set<string>();

  for (const p of empenho.parcelas) {
    const numero = normalizeEmpenhoNumero(p.numeroOficial);
    const allocationId = unitByNumero.get(numero);
    if (!allocationId) {
      if (p.quantidade != null) {
        semUnidade.empenhado += p.quantidade;
        semUnidade.count += 1;
      }
      continue;
    }
    const exec = porAlocacao.get(allocationId)!;
    exec.empenhado += p.quantidade ?? 0;
    if (!contadas.has(numero)) {
      exec.vinculados += 1;
      contadas.add(numero);
    }
  }
  // Nota ainda a vincular aos itens, já ligada a uma unidade: não soma empenhado, mas segura a unidade.
  for (const d of empenho.aVincular) {
    const numero = normalizeEmpenhoNumero(d.numeroOficial);
    const allocationId = unitByNumero.get(numero);
    if (!allocationId || contadas.has(numero)) continue;
    porAlocacao.get(allocationId)!.vinculados += 1;
    contadas.add(numero);
  }

  return { porAlocacao, semUnidade };
}
