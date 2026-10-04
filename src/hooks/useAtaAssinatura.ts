import { useQuery } from '@tanstack/react-query';
import type { ArpRecord } from '../types';
import { fetchAssinaturaAta, montarConsultaAtaOficial, type AtaOficialInfo } from '../services/ataOficialService';

/**
 * Data de assinatura da ata no Compras.gov.br.
 *
 * Query Key Canônica: ['ata-oficial', numeroAta, uasg]
 *
 * Sem nova tentativa e sem guardar falha (a consulta fica em erro e é refeita na próxima abertura);
 * a assinatura não muda, então o resultado vale por um dia.
 */
export function getAtaAssinaturaQueryOptions(arp?: ArpRecord | null) {
  return {
    queryKey: ['ata-oficial', arp?.numeroAtaRegistroPreco ?? '', arp?.codigoUnidadeGerenciadora ?? ''] as const,
    queryFn: async (): Promise<AtaOficialInfo | null> => (arp ? fetchAssinaturaAta(arp) : null),
    enabled: Boolean(arp) && montarConsultaAtaOficial(arp!) !== null,
    retry: false,
    staleTime: 24 * 60 * 60 * 1000
  };
}

export function useAtaAssinatura(arp?: ArpRecord | null) {
  return useQuery<AtaOficialInfo | null, Error>(getAtaAssinaturaQueryOptions(arp));
}
