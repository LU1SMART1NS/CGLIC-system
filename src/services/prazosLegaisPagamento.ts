/**
 * Prazos legais do ciclo de pagamento, contados em dias úteis:
 * - Portaria DGFNSP 50/2025, art. 5º: o processo chega com pelo menos 8 dias úteis antes do vencimento.
 * - IN SEGES 77/2022, art. 7º, I: liquidação em até 10 dias úteis do recebimento da nota (a data do atesto);
 *   o tempo com o contratado corrigindo a nota ou a execução não conta (§ 4º); prorrogável uma vez por igual
 *   período, com justificativa (§ 3º).
 * - IN 77, art. 7º, II: pagamento em até 10 dias úteis da liquidação.
 * - IN 77, art. 7º, § 2º: os dois prazos caem pela metade para despesa até o limite do art. 75, II da Lei 14.133.
 * - IN 77, art. 11: atraso maior que 2 meses da emissão da nota dá ao contratado direito à extinção.
 */
import { PAGAMENTO_RULES } from '../config/alertRules';
import { limiteArt75II, type LimiteArt75II } from '../config/limitesLei14133';
import { differenceInBusinessDays, parseDateBRT } from './temporalEngineService';
import type { PaymentFollowUpCycle } from '../types/paymentFollowUp';

export interface PrazoLegal {
  /** Dias úteis já corridos (até a conclusão ou até hoje). */
  diasUteis: number;
  teto: number;
  concluido: boolean;
  estourou: boolean;
}

export interface PrazosLegaisDoCiclo {
  pequenoValor: boolean;
  /** Limite do art. 75, II do ano do atesto (e se o ano ainda não tem decreto cadastrado). */
  limite: LimiteArt75II & { desatualizado: boolean };
  /** Margem da chegada à CGLIC até o vencimento contratual. */
  chegada: { diasUteisAteVencimento: number; minimo: number; fora: boolean };
  liquidacao: PrazoLegal & { diasComContratado: number; prorrogado: boolean };
  pagamento: PrazoLegal | null;
  /** Mais de 2 meses desde a emissão da nota (aqui, o atesto) sem pagamento. */
  riscoExtincao: boolean;
}

function dia(iso?: string | null): Date | null {
  return iso ? parseDateBRT(iso) : null;
}

/** Dias úteis de `inicio` a `fim` (0 quando faltar uma das datas ou o fim vier antes). */
function diasUteisEntre(inicio: Date | null, fim: Date | null): number {
  if (!inicio || !fim) return 0;
  return Math.max(0, differenceInBusinessDays(fim, inicio));
}

/**
 * Tempo com o contratado: de cada devolução ao FORNECEDOR até o "Recebido de volta" (ou a conferência seguinte,
 * ou hoje, se ainda não voltou).
 */
export function diasUteisComContratado(cycle: Pick<PaymentFollowUpCycle, 'eventos'>, hoje: Date): number {
  const eventos = [...(cycle.eventos ?? [])].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  let total = 0;
  let desde: Date | null = null;
  for (const e of eventos) {
    if (e.tipo === 'PENDENCIA' && e.origemPendencia === 'FORNECEDOR' && !desde) {
      desde = dia(e.dataEvento);
    } else if (desde && (e.tipo === 'RETORNO' || e.tipo === 'CONFERIDO' || e.tipo === 'CANCELADO')) {
      total += diasUteisEntre(desde, dia(e.dataEvento));
      desde = null;
    }
  }
  if (desde) total += diasUteisEntre(desde, hoje);
  return total;
}

export function calcularPrazosLegais(
  cycle: PaymentFollowUpCycle,
  opts: { valorContrato?: number | null; hoje?: Date } = {}
): PrazosLegaisDoCiclo {
  const hoje = opts.hoje ?? new Date();
  hoje.setHours(0, 0, 0, 0);
  const { input } = cycle;
  const valorReferencia = typeof opts.valorContrato === 'number' && opts.valorContrato > 0 ? opts.valorContrato : input.valorAtesto;
  const limite = limiteArt75II(input.dataAssinaturaAtesto || input.dataRecebimento);
  const pequenoValor = valorReferencia <= limite.valor;
  const divisor = pequenoValor ? 2 : 1;

  const atesto = dia(input.dataAssinaturaAtesto) ?? dia(input.dataRecebimento);
  const chegada = dia(input.dataRecebimento);
  const vencimento = dia(input.dataVencimentoFatura);
  const liquidacao = dia(input.dataLiquidacao);
  const ob = cycle.status === 'PAGO' ? dia(input.dataOrdemBancaria) : null;

  const margem = chegada && vencimento ? differenceInBusinessDays(vencimento, chegada) : 0;
  const minimo = PAGAMENTO_RULES.chegadaMinimaDiasUteis;

  const comContratado = diasUteisComContratado(cycle, liquidacao ?? hoje);
  const prorrogado = Boolean(input.liquidacaoProrrogada);
  const tetoLiquidacao = Math.ceil(PAGAMENTO_RULES.liquidacaoMaxDiasUteis / divisor) * (prorrogado ? 2 : 1);
  const diasLiquidacao = Math.max(0, diasUteisEntre(atesto, liquidacao ?? hoje) - comContratado);

  const tetoPagamento = Math.ceil(PAGAMENTO_RULES.pagamentoMaxDiasUteis / divisor);
  const pagamento = liquidacao
    ? (() => {
        const dias = diasUteisEntre(liquidacao, ob ?? hoje);
        return { diasUteis: dias, teto: tetoPagamento, concluido: Boolean(ob), estourou: dias > tetoPagamento };
      })()
    : null;

  const doisMeses = atesto ? new Date(atesto.getFullYear(), atesto.getMonth() + 2, atesto.getDate()) : null;
  const encerrado = cycle.status === 'PAGO' || cycle.status === 'CANCELADO';

  return {
    pequenoValor,
    limite,
    chegada: { diasUteisAteVencimento: margem, minimo, fora: Boolean(chegada && vencimento) && margem < minimo },
    liquidacao: {
      diasUteis: diasLiquidacao,
      teto: tetoLiquidacao,
      concluido: Boolean(liquidacao),
      estourou: diasLiquidacao > tetoLiquidacao,
      diasComContratado: comContratado,
      prorrogado
    },
    pagamento,
    riscoExtincao: !encerrado && Boolean(doisMeses) && hoje.getTime() > doisMeses!.getTime()
  };
}
