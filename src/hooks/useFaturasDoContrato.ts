import { useQuery } from '@tanstack/react-query';
import { fetchFaturasDoContrato, type FaturasDoContrato } from '../services/faturasService';

export const FATURAS_DO_CONTRATO_QUERY_KEY = (contractKey: string) => ['contrato-faturas', contractKey] as const;

/**
 * Faturas do contrato no Contratos.gov.br, com a liquidação e a ordem bancária (migration 83). Lê só o que está
 * gravado; quem atualiza é a sincronização do servidor. Usado nas abas Empenhos e Pagamentos e no contador da aba.
 */
export function useFaturasDoContrato(contractKey: string) {
  return useQuery<FaturasDoContrato, Error>({
    queryKey: FATURAS_DO_CONTRATO_QUERY_KEY(contractKey),
    queryFn: () => fetchFaturasDoContrato(contractKey),
    enabled: Boolean(contractKey),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });
}

/** Números das NEs que a fatura cita ("2024NE000337, 2024NE000301" → lista). */
export const empenhosDaFatura = (texto: string | null | undefined): string[] =>
  (texto ?? '').split(',').map((s) => s.trim()).filter(Boolean);
