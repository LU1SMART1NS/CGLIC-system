import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { fetchDistribuicoesDoContrato } from '../services/distribuicaoEmpenhoService';
import { DISTRIBUICAO_EMPENHOS_KEY } from './useDistribuicaoEmpenhos';
import { getItemContractLinksQueryOptions } from './useItemContractLinks';
import { parseItemKey } from '../utils/itemKeyUtils';
import { montarEmpenhoDoItem, type EmpenhoDoItem } from '../utils/empenhoDoItem';

/**
 * Empenho do item da ata pelo vínculo das notas aos itens do contrato: as parcelas deste item nas notas dos contratos
 * vinculados, as notas que ainda faltam vincular e os contratos sem itens na fonte. Lê os vínculos do item (com o preço
 * unitário do item em cada contrato) e as notas de cada contrato (o mesmo cache do Contrato 360 e da Vinculação, que
 * as ações de vincular invalidam).
 */
export function useEmpenhoDoItem(itemKey: string): { data: EmpenhoDoItem; isLoading: boolean; isReady: boolean } {
  const partes = itemKey ? parseItemKey(itemKey) : null;
  const links = useQuery(getItemContractLinksQueryOptions(partes?.numeroAta, partes?.uasg, partes?.itemNum, itemKey));
  const contratos = useMemo(() => {
    const vistos = new Map<string, number | null>();
    for (const l of links.data ?? []) if (!vistos.has(l.contractKey)) vistos.set(l.contractKey, l.valorUnitarioApi ?? null);
    return [...vistos.entries()].map(([contractKey, valorUnitario]) => ({ contractKey, valorUnitario }));
  }, [links.data]);
  const notas = useQueries({
    queries: contratos.map((c) => ({
      queryKey: DISTRIBUICAO_EMPENHOS_KEY(c.contractKey),
      queryFn: () => fetchDistribuicoesDoContrato(c.contractKey),
      staleTime: 60 * 1000
    }))
  });
  const assinatura = notas.map((q) => q.dataUpdatedAt).join('|');
  const data = useMemo(
    () =>
      montarEmpenhoDoItem({
        numeroItem: partes?.itemNumInteger ?? NaN,
        contratos: contratos.map((c, i) => ({ ...c, distribuicoes: notas[i]?.data ?? [] }))
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contratos, assinatura, partes?.itemNumInteger]
  );
  return {
    data,
    isLoading: links.isLoading || notas.some((q) => q.isLoading),
    // Tudo lido sem erro: só então dá para concluir que uma nota não tem quantidade neste item.
    isReady: links.isSuccess && notas.every((q) => q.isSuccess)
  };
}
