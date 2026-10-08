import type { EmpenhoDoItem, ExecucaoNoContrato } from './empenhoDoItem';

const EPS = 0.0001;

/** Execução de UM contrato no item: quanto foi contratado, empenhado e quantas notas ainda faltam vincular aos itens. */
export interface ContractExecution {
  /** Quantidade do item no contrato segundo a API; nula quando ainda não foi lida. */
  contratado: number | null;
  /** Soma das parcelas deste item nas notas vinculadas aos itens (em unidades). */
  empenhado: number;
  /** Notas do contrato ainda a vincular aos itens que podem conter este item. */
  aVincular: number;
  /** O contrato não tem itens na fonte: as notas não são divididas por item. */
  semItens: boolean;
  /** Contratado menos empenhado; nulo sem a quantidade contratada. Negativo = empenhado acima do contratado. */
  aEmpenhar: number | null;
}

export function summarizeContractExecution(contratado: number | null | undefined, execucao: ExecucaoNoContrato | undefined): ContractExecution {
  const empenhado = execucao?.empenhado ?? 0;
  const base = contratado == null ? null : contratado;
  return {
    contratado: base,
    empenhado,
    aVincular: execucao?.aVincular.length ?? 0,
    semItens: execucao?.semItens ?? false,
    aEmpenhar: base == null ? null : base - empenhado
  };
}

/** Resumo do item: o consumo da ata é o contratado; o empenho é a execução desse contratado. */
export interface ItemExecutionSummary {
  homologado: number;
  contratado: number;
  /** Vínculos cuja quantidade ainda não foi lida da API (não somam no contratado). */
  contratosSemQuantidade: number;
  saldoAta: number;
  empenhado: number;
  aEmpenhar: number;
  /** Notas dos contratos do item ainda a vincular aos itens que podem conter este item (e o valor delas). */
  notasAVincular: number;
  valorAVincular: number;
  /** Contratos sem itens na fonte e o valor das notas deles (só referência: não conta no empenhado). */
  contratosSemItens: number;
  valorSemDivisao: number;
}

export function summarizeItemExecution(params: {
  homologado: number;
  /** Quantidade contratada de cada contrato vinculado; nulo = ainda não lida. */
  contratados: Array<number | null | undefined>;
  empenho: EmpenhoDoItem;
}): ItemExecutionSummary {
  const { homologado, contratados, empenho } = params;
  const contratado = contratados.reduce<number>((sum, q) => sum + (q ?? 0), 0);
  const execucoes = [...empenho.porContrato.values()];
  return {
    homologado,
    contratado,
    contratosSemQuantidade: contratados.filter((q) => q == null).length,
    saldoAta: homologado - contratado,
    empenhado: empenho.empenhado,
    aEmpenhar: contratado - empenho.empenhado,
    notasAVincular: empenho.aVincular.length,
    valorAVincular: empenho.aVincular.reduce((s, d) => s + d.valorNota, 0),
    contratosSemItens: empenho.contratosSemItens,
    valorSemDivisao: execucoes.reduce((s, e) => s + e.valorSemDivisao, 0)
  };
}

/** Consumo do item informado pelo Compras.gov (por unidade: registrada menos saldo para empenho). */
export function comprasGovConsumido(
  unidades: Array<{ quantidadeRegistrada?: number | null; saldoRemanejamentoEmpenho?: number | null }>
): number | undefined {
  let total = 0;
  let algum = false;
  for (const u of unidades) {
    if (typeof u.quantidadeRegistrada === 'number' && typeof u.saldoRemanejamentoEmpenho === 'number') {
      total += u.quantidadeRegistrada - u.saldoRemanejamentoEmpenho;
      algum = true;
    }
  }
  return algum ? total : undefined;
}

/**
 * Compara o consumo informado pelo Compras.gov com o contratado nos contratos vinculados.
 * ACIMA = o Compras.gov registra mais consumo do que os contratos vinculados cobrem
 * (há consumo sem contrato vinculado). É só referência: não altera o saldo.
 */
export type ReferenciaComprasGovStatus = 'SEM_DADO' | 'CONSISTENTE' | 'ACIMA' | 'ABAIXO';

export function compareWithComprasGov(consumido: number | undefined, contratado: number): {
  status: ReferenciaComprasGovStatus;
  delta: number;
} {
  if (consumido === undefined) return { status: 'SEM_DADO', delta: 0 };
  const delta = consumido - contratado;
  if (Math.abs(delta) < EPS) return { status: 'CONSISTENTE', delta: 0 };
  return { status: delta > 0 ? 'ACIMA' : 'ABAIXO', delta };
}
