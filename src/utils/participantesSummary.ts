/**
 * Consumo de cada órgão no item da ata (aba Órgãos participantes).
 *
 * - Órgão gerenciador da ata: consome o que os contratos vinculados ao item somam (o mesmo critério do
 *   saldo da ata), porque o Compras.gov costuma registrar o consumo com atraso.
 * - Demais órgãos: consumo informado pelo Compras.gov (registrado menos o saldo para empenho).
 */
import { quantitativoSenasp } from './quantitativoSenasp';

export type ConsumoFonte = 'CONTRATOS' | 'COMPRASGOV';

export interface ParticipanteRow {
  codigo: string;
  nome: string;
  gerenciadora: boolean;
  registrado: number;
  consumido: number;
  saldo: number;
  fonte: ConsumoFonte;
}

export interface ParticipantesSummary {
  rows: ParticipanteRow[];
  /** Total da ata (todos os órgãos): só referência. */
  registrado: number;
  consumido: number;
  saldo: number;
  /** Quantitativo SENASP (UASGs do CGLIC): o que o sistema gerencia. Consumo = contratado nos contratos vinculados. */
  senasp: { registrado: number; consumido: number; saldo: number };
}

const digits = (v?: string | number | null) => String(v ?? '').replace(/\D/g, '');

export function summarizeParticipantes(
  unidades: Array<{
    codigoUnidade: string;
    nomeUnidade: string;
    tipoUnidade?: string;
    quantidadeRegistrada: number;
    saldoRemanejamentoEmpenho?: number | null;
  }>,
  params: { ugUasg: string; contratadoUG: number }
): ParticipantesSummary {
  const ug = digits(params.ugUasg);
  const rows: ParticipanteRow[] = unidades.map((u) => {
    const codigo = digits(u.codigoUnidade);
    const registrado = Number(u.quantidadeRegistrada) || 0;
    const isUg = codigo !== '' && codigo === ug;
    const consumido = isUg
      ? params.contratadoUG
      : typeof u.saldoRemanejamentoEmpenho === 'number'
        ? registrado - u.saldoRemanejamentoEmpenho
        : 0;
    return {
      codigo: u.codigoUnidade,
      nome: u.nomeUnidade,
      gerenciadora: isUg || u.tipoUnidade === 'GERENCIADORA',
      registrado,
      consumido,
      saldo: registrado - consumido,
      fonte: isUg ? 'CONTRATOS' : 'COMPRASGOV'
    };
  });

  const registrado = rows.reduce((s, r) => s + r.registrado, 0);
  const consumido = rows.reduce((s, r) => s + r.consumido, 0);
  const senaspRegistrado = quantitativoSenasp(unidades, ug);
  return {
    rows,
    registrado,
    consumido,
    saldo: registrado - consumido,
    senasp: { registrado: senaspRegistrado, consumido: params.contratadoUG, saldo: senaspRegistrado - params.contratadoUG }
  };
}
