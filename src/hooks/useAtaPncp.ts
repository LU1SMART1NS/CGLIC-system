import { useQuery } from '@tanstack/react-query';
import { fetchPncpAtaVigencia, type PncpAtaVigenciaInfo } from '../services/api';

/**
 * Dados da ata no PNCP (data de divulgação, vigência e cancelamento), pelo Id PNCP da ata.
 *
 * Query Key Canônica: ['ata-pncp', numeroControlePncpAta]
 */
export function getAtaPncpQueryOptions(arp?: { numeroControlePncpAta?: string | null } | null) {
  const id = arp?.numeroControlePncpAta || '';
  return {
    queryKey: ['ata-pncp', id] as const,
    queryFn: async (): Promise<PncpAtaVigenciaInfo | null> => fetchPncpAtaVigencia(id),
    enabled: Boolean(id),
    retry: false,
    staleTime: 24 * 60 * 60 * 1000
  };
}

export function useAtaPncp(arp?: { numeroControlePncpAta?: string | null } | null) {
  return useQuery<PncpAtaVigenciaInfo | null, Error>(getAtaPncpQueryOptions(arp));
}
