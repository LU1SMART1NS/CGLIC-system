import { useCallback, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { UASGS_CGLIC } from '../config/unidadesGestoras';
import { useAtualizacaoNoServidor } from './useAtualizacaoNoServidor';
import { chaveStatusSincronizacao, podeForcarAtualizacao, useSituacaoSincronizacao } from './useSituacaoSincronizacao';

export const RECURSO_EMPENHOS = 'empenhos' as const;

/** Relê do banco tudo o que depende dos empenhos gravados. */
export async function invalidarDadosDeEmpenhos(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['management-dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['contratos-com-empenho-a-pagar'] }),
    queryClient.invalidateQueries({ queryKey: ['contrato-empenhos-sincronizacao'] }),
    queryClient.invalidateQueries({ queryKey: chaveStatusSincronizacao(RECURSO_EMPENHOS) })
  ]);
}

function relerEmpenhos(queryClient: QueryClient) {
  void invalidarDadosDeEmpenhos(queryClient);
}

/**
 * Situação da sincronização dos empenhos e o botão "Atualizar" da tela de Empenhos (mesmo desenho das carteiras).
 * - Coordenador: `atualizar` pede ao servidor a sincronização forçada das duas UASGs e espera terminar.
 * - Demais perfis não têm o botão; os dados chegam pelo agendamento do servidor.
 * Quando uma sincronização (deste ou de outro navegador) termina, a tela é recarregada do banco.
 */
export function useSincronizacaoEmpenhos() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const situacao = useSituacaoSincronizacao(RECURSO_EMPENHOS, relerEmpenhos);
  const atualizarNoServidor = useAtualizacaoNoServidor();

  const [isAtualizando, setIsAtualizando] = useState(false);
  const podeForcar = podeForcarAtualizacao(role);

  const atualizar = useCallback(async () => {
    setIsAtualizando(true);
    try {
      if (podeForcar) await atualizarNoServidor(RECURSO_EMPENHOS, UASGS_CGLIC);
      await invalidarDadosDeEmpenhos(queryClient);
    } finally {
      setIsAtualizando(false);
    }
  }, [podeForcar, queryClient, atualizarNoServidor]);

  return {
    ...situacao,
    sincronizando: isAtualizando || situacao.sincronizando,
    podeForcar,
    atualizar,
    isAtualizando
  };
}
