import { normalizeEmpenhoNumero } from '../services/empenhoNormalizationService';
import type { EmpenhoDoItem, ParcelaDoItem } from './empenhoDoItem';

/** Execução de uma alocação interna: o que a unidade empenhou, pelas parcelas deste item nas notas ligadas a ela. */
export interface AllocationExecution {
  /** Soma das quantidades das parcelas deste item nas notas ligadas à unidade. */
  empenhado: number;
  /** Notas do item ligadas à unidade com quantidade definida (impedem remover a unidade). */
  vinculados: number;
}

export interface AllocationExecutionSummary {
  porAlocacao: Map<string, AllocationExecution>;
  /** Parcelas deste item em notas que ainda não foram ligadas a nenhuma unidade interna. */
  semUnidade: { empenhado: number; count: number };
}

/**
 * Cruza o empenho do item (parcelas das notas vinculadas aos itens) com a ligação nota → unidade interna
 * (empenho_links, guardada pelo número da nota; a comparação ignora zeros e separadores). Só conta a nota com
 * quantidade definida neste item: sem quantidade, a nota não pode estar numa unidade (ver vinculosSemQuantidade).
 */
export function summarizeAllocationExecution(
  allocations: Array<{ id: string }>,
  empenho: Pick<EmpenhoDoItem, 'parcelas'>,
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
    if (p.quantidade == null) continue;
    const exec = porAlocacao.get(allocationId)!;
    exec.empenhado += p.quantidade;
    if (!contadas.has(numero)) {
      exec.vinculados += 1;
      contadas.add(numero);
    }
  }

  return { porAlocacao, semUnidade };
}

/** Quantidade deste item em cada nota (pelo número normalizado); só entram as parcelas com quantidade. */
export function quantidadePorNota(parcelas: Array<Pick<ParcelaDoItem, 'numeroOficial' | 'quantidade'>>): Map<string, number> {
  const porNota = new Map<string, number>();
  for (const p of parcelas) {
    if (p.quantidade == null) continue;
    const numero = normalizeEmpenhoNumero(p.numeroOficial);
    porNota.set(numero, (porNota.get(numero) ?? 0) + p.quantidade);
  }
  return porNota;
}

/**
 * Ligações nota → unidade de notas que não têm (ou deixaram de ter) quantidade neste item: saiu do item, voltou a
 * vincular ou o item não tem preço no contrato. Devolve as ligações que ficam e as que saem; nulo quando nada muda.
 */
export function vinculosSemQuantidade(
  links: Record<string, string>,
  parcelas: Array<Pick<ParcelaDoItem, 'numeroOficial' | 'quantidade'>>
): { restantes: Record<string, string>; removidos: Array<{ numero: string; allocationId: string }> } | null {
  const comQuantidade = quantidadePorNota(parcelas);
  const restantes: Record<string, string> = {};
  const removidos: Array<{ numero: string; allocationId: string }> = [];
  for (const [numero, allocationId] of Object.entries(links)) {
    if (comQuantidade.has(normalizeEmpenhoNumero(numero))) restantes[numero] = allocationId;
    else removidos.push({ numero, allocationId });
  }
  return removidos.length > 0 ? { restantes, removidos } : null;
}
