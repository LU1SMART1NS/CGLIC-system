import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  buscarFaturasDoContratoAgora,
  fetchEmpenhosDoContratoParaPagamento,
  fetchFaturasParaCiclo,
  type EmpenhoParaPagamento,
  type FaturaParaCiclo
} from '../../../services/cicloPagamentoApoioService';
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


/**
 * Faturas do contrato para o ciclo (envio à CGOFI ou escolha depois do envio): lista com as que citam um empenho do
 * ciclo primeiro, sugestão inicial, seleção, soma contra o valor do ciclo e "Buscar faturas agora".
 */
export function useFaturasDoCiclo(cycle: PaymentFollowUpCycle | null, contratoIdGov: string | number | null | undefined, opts: { incluirPagas?: boolean } = {}) {
  const queryClient = useQueryClient();
  const contractKey = cycle?.contractKey;
  const incluirPagas = Boolean(opts.incluirPagas);
  const { data: faturas = [], isLoading, refetch } = useQuery({
    queryKey: ['ciclo-faturas-disponiveis', contractKey, incluirPagas],
    queryFn: () => fetchFaturasParaCiclo(contractKey as string, { incluirPagas }),
    enabled: Boolean(contractKey),
    staleTime: 60 * 1000
  });
  const { data: empenhos = [] } = useEmpenhosDoContrato(contractKey);
  const [selecionadas, setSelecionadas] = React.useState<number[]>([]);
  const [tocou, setTocou] = React.useState(false);
  const [buscando, setBuscando] = React.useState(false);
  const [aviso, setAviso] = React.useState<string | null>(null);

  React.useEffect(() => {
    setTocou(false);
    setAviso(null);
  }, [cycle?.cycleKey]);
  React.useEffect(() => {
    if (cycle && !tocou) setSelecionadas(faturasSugeridas(faturas, cycle));
  }, [faturas, cycle, tocou]);

  const empenhosDoCiclo = new Set((cycle?.itens ?? []).map((i) => i.empenhoCanonicalKey).concat(cycle?.input.empenhoCanonicalKey ?? []));
  const numerosDoCiclo = empenhos.filter((e) => empenhosDoCiclo.has(e.canonicalKey)).map((e) => e.numero);
  const citaEmpenho = (f: FaturaParaCiclo) => numerosDoCiclo.some((n) => Boolean(f.empenhos?.includes(n)));
  const lista = [...faturas].sort((a, b) => Number(citaEmpenho(b)) - Number(citaEmpenho(a)));
  const soma = faturas.filter((f) => selecionadas.includes(f.idFatura)).reduce((s, f) => s + f.valorLiquido, 0);
  const divergente = Boolean(cycle) && selecionadas.length > 0 && Math.abs(soma - (cycle?.input.valorAtesto ?? 0)) >= 0.01;

  const alternar = (id: number) => {
    setTocou(true);
    setSelecionadas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const buscarAgora = async () => {
    if (!contratoIdGov || !contractKey) return;
    setBuscando(true);
    setAviso(null);
    try {
      const n = await buscarFaturasDoContratoAgora(contractKey, contratoIdGov);
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ['financeiro-faturas'] });
      setAviso(`Faturas do contrato consultadas agora no Contratos.gov.br: ${n} gravada(s).`);
    } catch (err) {
      setAviso(errorMessage(err, 'O Contratos.gov.br não respondeu. Tente de novo em instantes.'));
    } finally {
      setBuscando(false);
    }
  };

  return { lista, isLoading, selecionadas, alternar, soma, divergente, empenhos, empenhosDoCiclo, buscarAgora, buscando, aviso, podeBuscar: Boolean(contratoIdGov) };
}

export type FaturasDoCicloState = ReturnType<typeof useFaturasDoCiclo>;
