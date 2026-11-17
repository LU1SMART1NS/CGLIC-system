import { QueryClient } from '@tanstack/react-query';
import { repetirMenosTempoEsgotado } from '../services/filaDoBanco';

/**
 * Centralized React Query client configuration for CGLIC 3.0.
 *
 * Policies:
 * - staleTime: 5 minutes (data from external government APIs is relatively static during browsing)
 * - gcTime: 15 minutes (preserves cached resources in memory for quick back-and-forth navigation)
 * - retry: 1, menos no tempo esgotado do banco (a fila do banco já repetiu; ver repetirMenosTempoEsgotado)
 * - refetchOnWindowFocus: false (avoids unsolicited re-fetching when switching browser tabs)
 * - refetchOnReconnect: true (re-syncs if network connectivity is dropped and restored)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 15 * 60 * 1000,    // 15 minutes
      retry: repetirMenosTempoEsgotado,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true
    }
  }
});
