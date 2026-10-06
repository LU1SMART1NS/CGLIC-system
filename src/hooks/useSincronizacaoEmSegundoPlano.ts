import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { UASGS_CGLIC } from '../config/unidadesGestoras';
import { sincronizarContratos } from '../services/contratosOficiaisService';
import { sincronizarAtas } from '../services/syncService';
import type { ResultadoSincronizacao } from '../services/sincronizacaoFontesService';
import { podeSincronizar } from './useSituacaoSincronizacao';
import { invalidarDadosDeContratos } from './useSincronizacaoContratos';
import { invalidarDadosDeAtas } from './useAtasPortfolio';

/** Quem deixa o sistema aberto o dia todo volta a conferir a validade de tempos em tempos. */
const INTERVALO_SEGUNDO_PLANO_MS = 30 * 60 * 1000;

/** Usuários que já dispararam a conferência nesta sessão (evita repetir ao remontar o layout). */
const conferidoNestaSessao = new Set<string>();

function houveMudanca(resultado: ResultadoSincronizacao): boolean {
  return resultado.status !== 'NAO_RESERVADO';
}

/**
 * Montado uma vez no layout. Para gestor e coordenador, confere se contratos e atas passaram da
 * validade e, se passaram, sincroniza em segundo plano, sem bloquear a tela. A trava do banco garante
 * que, com várias pessoas abrindo o sistema, só uma sincroniza cada recurso. Perfis de consulta nunca
 * disparam. Roda ao abrir e a cada 30 minutos; na maior parte das vezes a reserva é negada (dados
 * na validade) e nenhuma API do governo é consultada.
 */
export function useSincronizacaoEmSegundoPlano() {
  const { role, user } = useAuth();
  const queryClient = useQueryClient();
  const habilitado = podeSincronizar(role) && Boolean(user?.id);

  useEffect(() => {
    if (!habilitado || !user?.id) return;
    let cancelado = false;

    const conferir = async () => {
      // Contratos primeiro: é a lista de que mais telas dependem e a sincronização mais curta.
      for (const uasg of UASGS_CGLIC) {
        if (cancelado) return;
        const resultado = await sincronizarContratos(uasg);
        if (resultado.status === 'ERRO') console.warn(`[sincronizacao] contratos da UASG ${uasg}:`, resultado.erro);
        if (houveMudanca(resultado)) await invalidarDadosDeContratos(queryClient);
      }
      for (const uasg of UASGS_CGLIC) {
        if (cancelado) return;
        const resultado = await sincronizarAtas(uasg);
        if (resultado.status === 'ERRO') console.warn(`[sincronizacao] atas da UASG ${uasg}:`, resultado.erro);
        if (houveMudanca(resultado)) await invalidarDadosDeAtas(queryClient);
      }
    };

    if (!conferidoNestaSessao.has(user.id)) {
      conferidoNestaSessao.add(user.id);
      void conferir();
    }
    const intervalo = setInterval(() => void conferir(), INTERVALO_SEGUNDO_PLANO_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [habilitado, user?.id, queryClient]);
}
