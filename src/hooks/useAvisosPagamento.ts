import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useExpectativasPagamento } from './useExpectativasPagamento';
import { FINANCEIRO_QUERY_KEYS } from './useFinanceiroCarteira';
import { useContratosDoFinanceiro } from '../components/financeiro/useContratosDoFinanceiro';
import { fetchCiclosEmAberto, fetchFaturasParaAvisos } from '../services/financeiroCarteiraService';
import { useFaturasDoContrato } from './useFaturasDoContrato';
import { fetchEnvioPrevisao, mesDaProximaPrevisao, prazoDaPrevisao } from '../services/previsaoMensalService';
import { calcularAvisosPagamento, type AvisoPagamento, type CicloParaAviso } from '../services/avisosPagamentoService';
import type { PaymentFollowUpCycle } from '../types/paymentFollowUp';
import type { AttentionItemWithUasg } from '../components/instrumentos/gestaoInstrumentosRowHelpers';

const OPCOES = { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false } as const;
const SEM_AVISOS: AvisoPagamento[] = [];

/**
 * Faturas dos avisos, por contratos marcados. Fica sob o prefixo das faturas do Financeiro: quem relê as faturas
 * (invalidarFinanceiro, ciclo de pagamento) relê também estas.
 */
export const faturasDosAvisosKey = (contratos: readonly string[]) => [...FINANCEIRO_QUERY_KEYS.faturas, 'avisos', contratos.join(',')] as const;

const paraAviso = (c: PaymentFollowUpCycle): CicloParaAviso => ({
  contractKey: c.contractKey,
  competencia: c.competencia,
  dataRecebimento: c.input?.dataRecebimento,
  dataAssinaturaAtesto: c.input?.dataAssinaturaAtesto,
  status: c.status
});

/**
 * Avisos da expectativa de pagamento para o Início: previsão mensal (só o coordenador envia), nota mensal que
 * não chegou e entrega prevista sem nota. O perfil gestor vê só os contratos da carteira dele.
 */
export function useAvisosPagamentoGerais(opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? true;
  const { role } = useAuth();
  const { marcas, entregas, isLoading: carregandoMarcas } = useExpectativasPagamento();
  const { contrato, lista, escopo, isLoading: carregandoContratos } = useContratosDoFinanceiro();
  const temMarcas = marcas.size > 0 || entregas.length > 0;
  // A regra só olha as faturas dos contratos marcados (mensal ou com entrega prevista) e só 4 campos: lê só isso, da
  // tabela, em vez das 21 colunas da view e da conferência do Tesouro de todas as faturas.
  const contratosMarcados = useMemo(
    () => [...new Set([...marcas.keys(), ...entregas.map((e) => e.contractKey)])].sort(),
    [marcas, entregas]
  );
  // Sem nenhum contrato marcado, as faturas e os ciclos não são lidos.
  const faturas = useQuery({
    queryKey: faturasDosAvisosKey(contratosMarcados),
    queryFn: () => fetchFaturasParaAvisos(contratosMarcados),
    enabled: enabled && temMarcas,
    ...OPCOES
  });
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
      faturas: faturas.data ?? [],
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
  // As faturas que o Contrato 360 já lê (contador das abas, Empenhos, Pagamentos): uma leitura de v_contrato_faturas
  // para a tela toda. Antes a fila de ações lia de novo as não canceladas, com os ciclos de cada uma, para usar só a
  // emissão e a referência. A conta tira as canceladas, e a ordem não importa.
  const faturas = useFaturasDoContrato(contractKey);

  return useMemo(() => {
    if (!marcado || !vigente || !faturas.isSuccess) return SEM_AVISOS;
    const marca = marcas.get(contractKey);
    return calcularAvisosPagamento({
      marcas: marca ? new Map([[contractKey, marca]]) : new Map(),
      entregas: entregas.filter((e) => e.contractKey === contractKey),
      faturas: faturas.data.faturas.map((f) => ({ contractKey, emissao: f.emissao, referencia: f.referencia, cancelada: f.cancelada })),
      ciclos: cycles.map(paraAviso),
      contratosVigentes: new Set([contractKey])
    });
  }, [marcado, vigente, faturas.isSuccess, faturas.data, marcas, entregas, contractKey, cycles]);
}

/** Aviso como linha do Início (categoria PAGAMENTO_PREVISTO, aba Pagamentos). A previsão não tem UASG própria. */
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
