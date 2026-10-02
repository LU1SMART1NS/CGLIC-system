import { useQuery } from '@tanstack/react-query';
import { fetchContractEmpenhoItemLinks, type ContractEmpenhoItemLink } from '../services/contractEmpenhoItemLinksService';

/** Query key: ['contract-empenho-item-links', contractKey] */
export function useContractEmpenhoItemLinks(contractKey?: string) {
  const key = (contractKey || '').trim();
  return useQuery<ContractEmpenhoItemLink[], Error>({
    queryKey: ['contract-empenho-item-links', key] as const,
    queryFn: () => fetchContractEmpenhoItemLinks(key),
    enabled: Boolean(key),
    staleTime: 60 * 1000
  });
}
