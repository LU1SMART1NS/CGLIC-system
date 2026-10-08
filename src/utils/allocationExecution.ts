import { normalizeEmpenhoNumero } from '../services/empenhoNormalizationService';
import type { ItemEmpenhoVinculo } from '../types/itemEmpenhoVinculo';

/** Execução de uma alocação interna: o que as unidades empenharam, pelas quantidades confirmadas dos empenhos. */
export interface AllocationExecution {
  /** Soma das quantidades confirmadas dos empenhos vinculados à alocação. */
  empenhado: number;
  /** Empenhos vinculados à alocação que ainda não têm quantidade confirmada (não contam no empenhado). */
  pendentes: number;
  pendentesSugerido: number;
  /** Empenhos do item vinculados à alocação, com ou sem quantidade confirmada (impedem remover a unidade). */
  vinculados: number;
}

export interface AllocationExecutionSummary {
  porAlocacao: Map<string, AllocationExecution>;
  /** Empenhos com quantidade confirmada que ainda não foram vinculados a nenhuma unidade interna. */
  semUnidade: { empenhado: number; count: number };
}

/**
 * Cruza os empenhos do item (arp_item_empenhos) com os vínculos empenho -> alocação (empenho_links).
 * Os vínculos são guardados pelo número do empenho; a comparação ignora zeros à esquerda e separadores.
 */
export function summarizeAllocationExecution(
  allocations: Array<{ id: string }>,
  vinculos: ItemEmpenhoVinculo[],
  empenhoLinks: Record<string, string>
): AllocationExecutionSummary {
  const validIds = new Set(allocations.map((a) => a.id));
  const unitByNumero = new Map<string, string>();
  for (const [numero, allocationId] of Object.entries(empenhoLinks)) {
    if (allocationId && validIds.has(allocationId)) unitByNumero.set(normalizeEmpenhoNumero(numero), allocationId);
  }

  const porAlocacao = new Map<string, AllocationExecution>(
    allocations.map((a) => [a.id, { empenhado: 0, pendentes: 0, pendentesSugerido: 0, vinculados: 0 }])
  );
  const semUnidade = { empenhado: 0, count: 0 };

  for (const v of vinculos) {
    const allocationId = unitByNumero.get(normalizeEmpenhoNumero(v.empenho.numero));
    if (!allocationId) {
      if (v.quantidade != null) {
        semUnidade.empenhado += v.quantidade;
        semUnidade.count += 1;
      }
      continue;
    }
    const exec = porAlocacao.get(allocationId)!;
    exec.vinculados += 1;
    if (v.quantidade != null) {
      exec.empenhado += v.quantidade;
    } else {
      exec.pendentes += 1;
      exec.pendentesSugerido += v.quantidadeSugerida ?? 0;
    }
  }

  return { porAlocacao, semUnidade };
}
