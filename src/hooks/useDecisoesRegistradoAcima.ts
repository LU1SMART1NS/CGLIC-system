import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  decidirRegistradoAcima,
  desfazerDecisaoRegistradoAcima,
  fetchDecisoesRegistradoAcima,
  type DecidirRegistradoAcimaInput,
  type DecisaoDoAviso
} from '../services/registradoAcimaDecisaoService';
import { AVISOS_RESOLVIDOS_QUERY_KEY } from './useAvisosResolvidos';

export const DECISOES_REGISTRADO_ACIMA_KEY = ['registrado-acima-decisoes'] as const;
const VAZIO: DecisaoDoAviso[] = [];

/** Decisões do aviso "registrado acima do homologado" (migration 223), com as ações de decidir e desfazer. */
export function useDecisoesRegistradoAcima() {
  const queryClient = useQueryClient();
  const consulta = useQuery({ queryKey: DECISOES_REGISTRADO_ACIMA_KEY, queryFn: fetchDecisoesRegistradoAcima, staleTime: 5 * 60 * 1000 });
  const porChave = useMemo(() => new Map((consulta.data ?? VAZIO).map((d) => [d.chave, d])), [consulta.data]);
  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: DECISOES_REGISTRADO_ACIMA_KEY });
    // Aceitar grava também o "resolvido" (tira o desconto): saldo, avisos e Painel mudam.
    void queryClient.invalidateQueries({ queryKey: AVISOS_RESOLVIDOS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ['ata-item-saldos'] });
    void queryClient.invalidateQueries({ queryKey: ['management-dashboard'] });
  };
  const decidir = useMutation<void, Error, DecidirRegistradoAcimaInput>({ mutationFn: decidirRegistradoAcima, retry: 0, onSuccess: invalidar });
  const desfazer = useMutation<void, Error, string>({ mutationFn: desfazerDecisaoRegistradoAcima, retry: 0, onSuccess: invalidar });
  return { consulta, porChave, decidir, desfazer };
}
