import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { decidirAusenteDaFonteRpc } from '../adapters/contractManagementRpcAdapter';
import { fetchAusentesDaFonte, type AusenteDaFonte } from '../services/ausentesDaFonteService';
import { useAuth } from '../context/AuthContext';

export const AUSENTES_DA_FONTE_QUERY_KEY = ['ausentes-da-fonte'] as const;

/**
 * Notas e faturas que a fonte deixou de listar e têm trabalho da equipe (migration 113): uma consulta pequena,
 * compartilhada pelo Início e pelo Contrato 360, com a decisão do coordenador (has_role('admin')).
 */
export function useAusentesDaFonte() {
  const queryClient = useQueryClient();
  const { role } = useAuth();

  const consulta = useQuery<AusenteDaFonte[], Error>({
    queryKey: AUSENTES_DA_FONTE_QUERY_KEY,
    queryFn: fetchAusentesDaFonte,
    staleTime: 5 * 60 * 1000
  });
  const { data = [], isLoading } = consulta;

  const porChave = useMemo(() => new Map(data.map((a) => [`${a.tipo}|${a.chave}`, a])), [data]);

  const decidir = useMutation({
    mutationFn: decidirAusenteDaFonteRpc,
    retry: 0,
    onSuccess: () => {
      // Mesmas leituras que mudam quando uma nota ou fatura sai do contrato.
      for (const key of [AUSENTES_DA_FONTE_QUERY_KEY[0], 'management-dashboard', 'contract-empenhos', 'v_contrato_empenhos_lastro', 'v_empenhos_resumo', 'contrato-empenho-distribuicao', 'contract-events', 'empenho-por-numero', 'contratado-do-item', 'ata-item-saldos', 'financeiro-ciclos-em-aberto', 'financeiro-faturas-em-ciclo', 'ciclo-faturas-disponiveis', 'contract-payment-cycles']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    }
  });

  return { ausentes: data, porChave, isLoading, decidir, podeDecidir: role === 'admin', /** Para a faixa "não carregou". */ consulta };
}
