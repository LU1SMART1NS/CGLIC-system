import type { ItemEmpenhoVinculo } from '../types/itemEmpenhoVinculo';

const EPS = 0.0001;
const sameKey = (a?: string | null, b?: string | null) => (a || '').trim().toUpperCase() === (b || '').trim().toUpperCase();

/** Execução de UM contrato no item: quanto foi contratado, empenhado e o que ainda falta confirmar ou empenhar. */
export interface ContractExecution {
  /** Quantidade do item no contrato segundo a API; nula quando ainda não foi lida. */
  contratado: number | null;
  /** Soma das quantidades dos empenhos já confirmados (API ou gestor). */
  empenhado: number;
  /** Empenhos sem quantidade confirmada. */
  pendentes: number;
  /** Soma das quantidades sugeridas dos empenhos pendentes (estimativa por valor). */
  pendentesSugerido: number;
  /** Contratado menos empenhado; nulo sem a quantidade contratada. Negativo = empenhado acima do contratado. */
  aEmpenhar: number | null;
}

export function summarizeContractExecution(
  contractKey: string,
  contratado: number | null | undefined,
  vinculos: ItemEmpenhoVinculo[]
): ContractExecution {
  const rows = vinculos.filter((v) => sameKey(v.contractKey, contractKey));
  const empenhado = rows.reduce((sum, v) => sum + (v.quantidade ?? 0), 0);
  const pendentesRows = rows.filter((v) => v.quantidade == null);
  const pendentesSugerido = pendentesRows.reduce((sum, v) => sum + (v.quantidadeSugerida ?? 0), 0);
  const base = contratado == null ? null : contratado;
  return {
    contratado: base,
    empenhado,
    pendentes: pendentesRows.length,
    pendentesSugerido,
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
  pendentes: number;
  pendentesSugerido: number;
  aEmpenhar: number;
}

export function summarizeItemExecution(params: {
  homologado: number;
  /** Quantidade contratada de cada contrato vinculado; nulo = ainda não lida. */
  contratados: Array<number | null | undefined>;
  vinculos: ItemEmpenhoVinculo[];
}): ItemExecutionSummary {
  const { homologado, contratados, vinculos } = params;
  const contratado = contratados.reduce<number>((sum, q) => sum + (q ?? 0), 0);
  const contratosSemQuantidade = contratados.filter((q) => q == null).length;
  const empenhado = vinculos.reduce((sum, v) => sum + (v.quantidade ?? 0), 0);
  const pendentesRows = vinculos.filter((v) => v.quantidade == null);
  return {
    homologado,
    contratado,
    contratosSemQuantidade,
    saldoAta: homologado - contratado,
    empenhado,
    pendentes: pendentesRows.length,
    pendentesSugerido: pendentesRows.reduce((sum, v) => sum + (v.quantidadeSugerida ?? 0), 0),
    aEmpenhar: contratado - empenhado
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
