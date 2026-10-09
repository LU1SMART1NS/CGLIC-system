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
  /** Notas ligadas à mão a uma unidade que não está na divisão do contrato delas (conferir). */
  foraDoContrato: Array<{ numero: string; allocationId: string; contractKey: string }>;
}

/**
 * Cruza o empenho do item (parcelas das notas vinculadas aos itens) com a ligação nota → unidade interna
 * (empenho_links, guardada pelo número da nota; a comparação ignora zeros e separadores). Só conta a nota com
 * quantidade definida neste item: sem quantidade, a nota não pode estar numa unidade (ver vinculosSemQuantidade).
 *
 * Sem ligação à mão, a nota herda a unidade do contrato quando o contrato foi dividido para uma unidade só
 * (`unidadesPorContrato`, migration 103). A ligação à mão vale sempre; se ela aponta para uma unidade fora da
 * divisão do contrato, a nota entra em `foraDoContrato`.
 */
export function summarizeAllocationExecution(
  allocations: Array<{ id: string }>,
  empenho: Pick<EmpenhoDoItem, 'parcelas'>,
  empenhoLinks: Record<string, string>,
  unidadesPorContrato?: ReadonlyMap<string, string[]>
): AllocationExecutionSummary {
  const validIds = new Set(allocations.map((a) => a.id));
  const unitByNumero = new Map<string, string>();
  for (const [numero, allocationId] of Object.entries(empenhoLinks)) {
    if (allocationId && validIds.has(allocationId)) unitByNumero.set(normalizeEmpenhoNumero(numero), allocationId);
  }

  const porAlocacao = new Map<string, AllocationExecution>(allocations.map((a) => [a.id, { empenhado: 0, vinculados: 0 }]));
  const semUnidade = { empenhado: 0, count: 0 };
  const foraDoContrato: AllocationExecutionSummary['foraDoContrato'] = [];
  const contadas = new Set<string>();

  for (const p of empenho.parcelas) {
    const numero = normalizeEmpenhoNumero(p.numeroOficial);
    const doContrato = unidadesPorContrato?.get(p.contractKey)?.filter((id) => validIds.has(id)) ?? [];
    const ligada = unitByNumero.get(numero);
    const allocationId = ligada ?? (doContrato.length === 1 ? doContrato[0] : undefined);
    if (ligada && doContrato.length > 0 && !doContrato.includes(ligada)) {
      foraDoContrato.push({ numero: p.numeroOficial, allocationId: ligada, contractKey: p.contractKey });
    }
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

  return { porAlocacao, semUnidade, foraDoContrato };
}

/**
 * Unidade da nota neste item, para a tela: a ligada à mão ou, sem ela, a herdada do contrato dividido para uma
 * unidade só. `herdada` = veio do contrato.
 */
export function unidadeDaNota(
  numeroEmpenho: string,
  contractKey: string,
  empenhoLinks: Record<string, string>,
  unidadesPorContrato?: ReadonlyMap<string, string[]>
): { allocationId: string; herdada: boolean } | null {
  const alvo = normalizeEmpenhoNumero(numeroEmpenho);
  for (const [numero, allocationId] of Object.entries(empenhoLinks)) {
    if (allocationId && normalizeEmpenhoNumero(numero) === alvo) return { allocationId, herdada: false };
  }
  const doContrato = unidadesPorContrato?.get(contractKey) ?? [];
  return doContrato.length === 1 ? { allocationId: doContrato[0], herdada: true } : null;
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
