import { useQuery } from '@tanstack/react-query';
import { fetchEmpenhosDoContratoParaPagamento, type EmpenhoParaPagamento, type FaturaParaCiclo } from '../../../services/cicloPagamentoApoioService';
import type { PaymentCycleItem, PaymentFollowUpCycle } from '../../../types/paymentFollowUp';
import { differenceInBusinessDays, parseDateBRT } from '../../../services/temporalEngineService';

/** Funções e tipos compartilhados pelos formulários do ciclo de pagamento. */

export const TIPOS_DOCUMENTO_RECEBIDO = [
  'Termo de Atesto',
  'Nota Fiscal Eletrônica',
  'Nota Fiscal',
  'Fatura',
  'Termo de Recebimento Provisório',
  'Termo de Recebimento Definitivo',
  'Relatório de Acompanhamento Contratual',
  'Apólice de Seguro',
  'Boleto Bancário',
  'Guia de Recolhimento',
  'Multa',
  'Ofício',
  'Recibo',
  'RPA'
];

export const errorMessage = (err: unknown, fallback: string) => (err as { message?: string } | null)?.message || fallback;


/** Empenhos do contrato com saldo e natureza de despesa (abertura do ciclo, conferência e envio). */
export function useEmpenhosDoContrato(contractKey: string | undefined) {
  return useQuery({
    queryKey: ['ciclo-empenhos-contrato', contractKey],
    queryFn: () => fetchEmpenhosDoContratoParaPagamento(contractKey as string),
    enabled: Boolean(contractKey),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });
}

/** Dias úteis da chegada ao vencimento; abaixo do mínimo da Portaria 50 (art. 5º) o processo chegou fora do prazo. */
export function margemDaChegada(chegadaISO: string, vencimentoISO: string): number | null {
  const chegada = parseDateBRT(chegadaISO);
  const vencimento = parseDateBRT(vencimentoISO);
  if (!chegada || !vencimento) return null;
  return differenceInBusinessDays(vencimento, chegada);
}

/** Contrato que pode receber um ciclo (escolha feita na aba Pagamentos). */
export interface ContratoParaCiclo {
  contractKey: string;
  numero: string;
  fornecedorNome?: string;
  gestorNome?: string;
}

/** Saldo de cada empenho contra o que os itens do ciclo pedem; devolve os empenhos sem saldo suficiente. */
export function empenhosSemSaldo(itens: Array<{ empenho: string; valor: number }>, empenhos: EmpenhoParaPagamento[]): string[] {
  const pedido = new Map<string, number>();
  for (const i of itens) if (i.empenho) pedido.set(i.empenho, (pedido.get(i.empenho) ?? 0) + i.valor);
  return [...pedido.entries()]
    .filter(([key, valor]) => {
      const e = empenhos.find((x) => x.canonicalKey === key);
      return e ? valor - e.saldo > 0.005 : false;
    })
    .map(([key]) => empenhos.find((x) => x.canonicalKey === key)?.numero ?? key);
}


const numeroBR = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const numeroDoEmpenho = (key: string) => key.split('-').pop() ?? key;

/** Texto do item "DO PAGAMENTO" para colar no SEI (colunas separadas por tabulação). */
export function textoDoPagamento(itens: PaymentCycleItem[]): string {
  const cab = ['Nota Fiscal / Fatura', 'SEI Nº', 'Atesto (Ref SEI)', 'Empenho', 'Subelemento', 'Valor Bruto', 'Juros/Multa', 'Glosa', 'Desconto', 'Valor a Pagar'];
  const linhas = itens.map((i) => [
    i.notaFiscal, i.notaFiscalSei ?? '', i.atestoSei, numeroDoEmpenho(i.empenhoCanonicalKey), i.subelemento ?? '',
    numeroBR(i.valorBruto), numeroBR(i.jurosMulta), numeroBR(i.glosa), numeroBR(i.desconto), numeroBR(i.valorAPagar)
  ]);
  const total = itens.reduce((s, i) => s + i.valorAPagar, 0);
  return [cab, ...linhas, ['VALOR TOTAL', '', '', '', '', '', '', '', '', numeroBR(total)]].map((l) => l.join('\t')).join('\n');
}


/** Faturas que o sistema marca de saída: a única fatura livre com o valor do ciclo, ou nenhuma. */
export function faturasSugeridas(faturas: FaturaParaCiclo[], cycle: PaymentFollowUpCycle): number[] {
  const ja = (cycle.faturas ?? []).map((f) => f.idFatura);
  if (ja.length > 0) return ja;
  const livres = faturas.filter((f) => !f.cicloId);
  const exatas = livres.filter((f) => Math.abs(f.valorLiquido - cycle.input.valorAtesto) < 0.01);
  return exatas.length === 1 ? [exatas[0].idFatura] : [];
}

