import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useExpectativasPagamento } from './useExpectativasPagamento';
import { FINANCEIRO_QUERY_KEYS, useFaturasCarteira } from './useFinanceiroCarteira';
import { useContratosDoFinanceiro } from '../components/financeiro/useContratosDoFinanceiro';
import { fetchCiclosEmAberto } from '../services/financeiroCarteiraService';
import { fetchFaturasParaCiclo } from '../services/cicloPagamentoApoioService';
import { fetchEnvioPrevisao, mesDaProximaPrevisao, prazoDaPrevisao } from '../services/previsaoMensalService';
import { calcularAvisosPagamento, type AvisoPagamento, type CicloParaAviso } from '../services/avisosPagamentoService';
import type { PaymentFollowUpCycle } from '../types/paymentFollowUp';
import type { AttentionItemWithUasg } from '../components/instrumentos/gestaoInstrumentosRowHelpers';

const OPCOES = { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false } as const;
const SEM_AVISOS: AvisoPagamento[] = [];

const paraAviso = (c: PaymentFollowUpCycle): CicloParaAviso => ({
  contractKey: c.contractKey,
  competencia: c.competencia,
  dataRecebimento: c.input?.dataRecebimento,
  dataAssinaturaAtesto: c.input?.dataAssinaturaAtesto,
  status: c.status
});

/**
 * Avisos da expectativa de pagamento para a Visão Geral: previsão mensal (só o coordenador envia), nota mensal que
 * não chegou e entrega prevista sem nota. O perfil gestor vê só os contratos da carteira dele.
 */
export function useAvisosPagamentoGerais(opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? true;
  const { role } = useAuth();
  const { marcas, entregas, isLoading: carregandoMarcas } = useExpectativasPagamento();
  const { contrato, lista, escopo, isLoading: carregandoContratos } = useContratosDoFinanceiro();
  const temMarcas = marcas.size > 0 || entregas.length > 0;
  // Sem nenhum contrato marcado, as faturas e os ciclos não são lidos.
  const faturas = useFaturasCarteira({ enabled: enabled && temMarcas });
  const ciclos = useQuery({ queryKey: FINANCEIRO_QUERY_KEYS.ciclos, queryFn: fetchCiclosEmAberto, enabled: enabled && temMarcas, ...OPCOES });
  const mes = mesDaProximaPrevisao();
  const ehCoordenacao = role === 'admin';
  const envio = useQuery({ queryKey: ['previsao-envio', mes], queryFn: () => fetchEnvioPrevisao(mes), enabled: enabled && ehCoordenacao, ...OPCOES });

  const avisos = useMemo(() => {
    if (!enabled) return SEM_AVISOS;
    const vigentes = new Set(lista.filter((c) => !c.expirado && (!escopo || escopo.has(c.contractKey))).map((c) => c.contractKey));
    return calcularAvisosPagamento({
      previsao: ehCoordenacao && envio.isSuccess ? { mes, prazo: prazoDaPrevisao(mes), enviada: Boolean(envio.data) } : undefined,
      marcas,
      entregas,
      faturas: (faturas.data ?? []).map((f) => ({ contractKey: f.contractKey, emissao: f.emissao, referencia: f.referencia, cancelada: f.cancelada })),
      ciclos: (ciclos.data ?? []).map(paraAviso),
      contratosVigentes: vigentes,
      numeroDoContrato: (k) => contrato(k).numero
    });
  }, [enabled, lista, escopo, ehCoordenacao, envio.isSuccess, envio.data, mes, marcas, entregas, faturas.data, ciclos.data, contrato]);

  // Enquanto faturas e ciclos não chegam, os avisos de nota ficariam errados: espera.
  const isLoading = carregandoMarcas || carregandoContratos || (temMarcas && (faturas.isLoading || ciclos.isLoading));
  return { avisos: isLoading ? SEM_AVISOS : avisos, isLoading };
}

/** Avisos de nota de um contrato (Contrato 360, aba Ações), com os ciclos que a tela já carregou. */
export function useAvisosPagamentoDoContrato(contractKey: string, cycles: PaymentFollowUpCycle[], vigente: boolean) {
  const { marcas, entregas } = useExpectativasPagamento();
  const marcado = marcas.has(contractKey) || entregas.some((e) => e.contractKey === contractKey);
  const faturas = useQuery({
    queryKey: ['ciclo-faturas-disponiveis', contractKey, true],
    queryFn: () => fetchFaturasParaCiclo(contractKey, { incluirPagas: true }),
    enabled: Boolean(contractKey) && marcado && vigente,
    staleTime: 60 * 1000
  });

  return useMemo(() => {
    if (!marcado || !vigente || !faturas.isSuccess) return SEM_AVISOS;
    const marca = marcas.get(contractKey);
    return calcularAvisosPagamento({
      marcas: marca ? new Map([[contractKey, marca]]) : new Map(),
      entregas: entregas.filter((e) => e.contractKey === contractKey),
      faturas: faturas.data.map((f) => ({ contractKey, emissao: f.emissao, referencia: f.referencia, cancelada: false })),
      ciclos: cycles.map(paraAviso),
      contratosVigentes: new Set([contractKey])
    });
  }, [marcado, vigente, faturas.isSuccess, faturas.data, marcas, entregas, contractKey, cycles]);
}

/** Aviso como linha da Visão Geral (categoria PAGAMENTO_PREVISTO, aba Pagamentos). A previsão não tem UASG própria. */
export function avisoComoItemDeAtencao(a: AvisoPagamento, uasgPadrao: string): AttentionItemWithUasg {
  return {
    id: a.id,
    category: 'PAGAMENTO_PREVISTO',
    severity: a.severity,
    title: a.title,
    description: a.description,
    contractKey: a.contractKey,
    dataAlvo: a.dataAlvo,
    diasRelevantes: a.diasRelevantes,
    badgeLabel: a.badgeLabel,
    targetUrl: a.targetUrl,
    uasg: a.contractKey ? a.contractKey.slice(0, 6) : uasgPadrao
  };
}
