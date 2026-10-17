import { useCallback, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { UASGS_CGLIC } from '../config/unidadesGestoras';
import { RECURSO_CONTRATOS } from '../services/contratosOficiaisService';
import { useAtualizacaoNoServidor } from './useAtualizacaoNoServidor';
import {
  chaveStatusSincronizacao,
  podeForcarAtualizacao,
  podeSincronizar,
  useSituacaoSincronizacao
} from './useSituacaoSincronizacao';

export {
  INTERVALO_CONFERENCIA_STATUS_MS,
  podeForcarAtualizacao,
  resumirSincronizacao
} from './useSituacaoSincronizacao';

export const SINCRONIZACAO_STATUS_KEY = chaveStatusSincronizacao(RECURSO_CONTRATOS);

/** Gestor e coordenador gravam contratos no banco (sincronização e contrato completado no 360). */
export const podeSincronizarContratos = podeSincronizar;

/**
 * O painel do Início lê contratos, gestores e atas pelo cache (fontesDoPainelNoCache). Para ele reler tudo, como
 * antes, as três listas são invalidadas junto com o painel; as fontes vêm antes, para o painel já pegar a leitura nova.
 */
const CHAVES_DO_PAINEL = [['contracts-dashboard'], ['all-contract-managers'], ['ata-detail-source'], ['management-dashboard']] as const;

/** Relê do banco tudo o que depende da lista de contratos. */
export async function invalidarDadosDeContratos(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    ...CHAVES_DO_PAINEL.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    queryClient.invalidateQueries({ queryKey: SINCRONIZACAO_STATUS_KEY })
  ]);
}

function relerContratos(queryClient: QueryClient) {
  for (const queryKey of CHAVES_DO_PAINEL) void queryClient.invalidateQueries({ queryKey });
}

/**
 * Situação da sincronização dos contratos e o botão "Atualizar" das carteiras.
 * - Coordenador: `atualizar` pede ao servidor a sincronização forçada das duas UASGs e espera terminar.
 * - Demais perfis não têm o botão; `atualizar` só relê o banco (usado no "tentar de novo" de erros).
 * Quando uma sincronização (deste ou de outro navegador) termina, as telas são recarregadas do banco.
 */
export function useSincronizacaoContratos() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const situacao = useSituacaoSincronizacao(RECURSO_CONTRATOS, relerContratos);
  const atualizarNoServidor = useAtualizacaoNoServidor();

  const [isAtualizando, setIsAtualizando] = useState(false);
  const podeForcar = podeForcarAtualizacao(role);

  const atualizar = useCallback(async () => {
    setIsAtualizando(true);
    try {
      if (podeForcar) await atualizarNoServidor(RECURSO_CONTRATOS, UASGS_CGLIC);
      await invalidarDadosDeContratos(queryClient);
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
