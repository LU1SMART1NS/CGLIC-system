import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { UASGS_CGLIC } from '../config/unidadesGestoras';
import { classifyPrazo } from '../components/carteira/carteiraPrazo';
import { getContractDaysRemaining } from '../services/dashboardService';
import { carteiraDaAta, chaveGestaoDaArp } from '../utils/ataIdentidade';
import { chaveDoContrato } from '../utils/contractKeyUtils';
import { escopoDoGestor, listarGestores, type EscopoDoGestor, type GestorDaCarteira } from '../utils/escopoDoGestor';
import type { InstrumentoNoPainel } from '../components/instrumentos/painelResumo';
import { getAtaSourceQueryOptions } from './useAta';
import { getArpPrazo } from './useAtasPortfolio';
import { getContractsDashboardQueryOptions } from './useContractsDashboard';
import { getAllContractManagersQueryOptions } from './useAllContractManagers';
import { useAllAtaManagers, useArpItemContractLinks } from './useAtaManagers';

/**
 * Atas e contratos das duas UASGs já classificados pela faixa de prazo das carteiras, mais os gestores e a carteira de
 * cada um. Lê as mesmas consultas (e o mesmo cache) das carteiras de Atas e Contratos; só consulta quando `enabled`,
 * isto é, quando uma gaveta da Visão Geral que precisa disso está aberta.
 */
export function usePainelCarteira(enabled: boolean) {
  const atasQ = useQueries({ queries: UASGS_CGLIC.map((u) => ({ ...getAtaSourceQueryOptions(u), enabled })) });
  const contratosQ = useQueries({ queries: UASGS_CGLIC.map((u) => ({ ...getContractsDashboardQueryOptions(u), enabled })) });
  const gestoresQ = useQueries({ queries: UASGS_CGLIC.map((u) => ({ ...getAllContractManagersQueryOptions(u), enabled })) });
  const { data: ataManagers, isPending: ataManagersPending } = useAllAtaManagers();
  const { data: vinculos, isPending: vinculosPending } = useArpItemContractLinks(enabled);

  const assinatura = [...atasQ, ...contratosQ, ...gestoresQ].map((q) => q.dataUpdatedAt).join('|');

  const atas = useMemo<InstrumentoNoPainel[]>(
    () =>
      atasQ.flatMap((q) =>
        (q.data?.arps || []).map((arp) => ({ chave: chaveGestaoDaArp(arp), uasg: carteiraDaAta(arp), faixa: getArpPrazo(arp).faixa }))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assinatura]
  );

  const contratos = useMemo<InstrumentoNoPainel[]>(
    () =>
      contratosQ.flatMap((q) =>
        (q.data || []).map((c) => ({
          chave: chaveDoContrato(c),
          uasg: String(c.uasg || ''),
          faixa: classifyPrazo(getContractDaysRemaining(c.dataVigenciaFim), c.statusVigencia === 'Expirado')
        }))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assinatura]
  );

  const gestores = useMemo<Array<{ gestor: GestorDaCarteira; escopo: EscopoDoGestor }>>(() => {
    const contractManagers = gestoresQ.flatMap((q) => Object.values(q.data || {}));
    const atasM = Object.values(ataManagers || {});
    return listarGestores(contractManagers, atasM).map((gestor) => ({
      gestor,
      escopo: escopoDoGestor(gestor.userId, contractManagers, atasM, vinculos || [])
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura, ataManagers, vinculos]);

  const isLoading =
    enabled &&
    ([...atasQ, ...contratosQ, ...gestoresQ].some((q) => q.isPending) || ataManagersPending || vinculosPending);

  return { atas, contratos, gestores, isLoading };
}
