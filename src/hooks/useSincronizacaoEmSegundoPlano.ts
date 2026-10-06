import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { UASGS_CGLIC } from '../config/unidadesGestoras';
import { sincronizarContratos } from '../services/contratosOficiaisService';
import { sincronizarAtas } from '../services/syncService';
import { sincronizarSaldosItens } from '../services/saldosItensSyncService';
import type { ResultadoSincronizacao } from '../services/sincronizacaoFontesService';
import { podeSincronizar } from './useSituacaoSincronizacao';
import { invalidarDadosDeContratos } from './useSincronizacaoContratos';
import { invalidarDadosDeAtas } from './useAtasPortfolio';

/** Quem deixa o sistema aberto o dia todo volta a conferir a validade de tempos em tempos. */
const INTERVALO_SEGUNDO_PLANO_MS = 30 * 60 * 1000;

/** Relê do banco tudo o que depende dos saldos dos itens (quantidade contratada e quantitativo SENASP). */
export async function invalidarDadosDeSaldosItens(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['ata-item-saldos'] }),
    queryClient.invalidateQueries({ queryKey: ['ata-detail-source'] }),
    queryClient.invalidateQueries({ queryKey: ['management-dashboard'] })
  ]);
}

function houveMudanca(resultado: ResultadoSincronizacao): boolean {
  return resultado.status !== 'NAO_RESERVADO';
}

/**
 * Montado uma vez no layout. Para gestor e coordenador, confere se contratos, atas e saldos dos itens
 * passaram da validade e, se passaram, sincroniza em segundo plano, sem bloquear a tela. A trava do banco garante
 * que, com várias pessoas abrindo o sistema, só uma sincroniza cada recurso. Isso substitui os disparos
 * que as telas faziam sozinhas ao abrir (contrato, item, ata e Visão Geral). Perfis de consulta nunca
 * disparam. Roda ao abrir e a cada 30 minutos; na maior parte das vezes a reserva é negada (dados
 * na validade) e nenhuma API do governo é consultada.
 */
/**
 * Só uma conferência por vez neste navegador. O React em desenvolvimento executa o efeito, cancela e
 * executa de novo; sem isso, a segunda chamada repetiria as consultas e a primeira ficaria pela metade.
 */
let conferindo = false;

async function conferir(queryClient: QueryClient): Promise<void> {
  if (conferindo) return;
  conferindo = true;
  try {
    // Contratos primeiro: é a lista de que mais telas dependem e a sincronização mais curta.
    for (const uasg of UASGS_CGLIC) {
      const resultado = await sincronizarContratos(uasg);
      if (resultado.status === 'ERRO') console.warn(`[sincronizacao] contratos da UASG ${uasg}:`, resultado.erro);
      if (houveMudanca(resultado)) await invalidarDadosDeContratos(queryClient);
    }
    for (const uasg of UASGS_CGLIC) {
      const resultado = await sincronizarAtas(uasg);
      if (resultado.status === 'ERRO') console.warn(`[sincronizacao] atas da UASG ${uasg}:`, resultado.erro);
      if (houveMudanca(resultado)) await invalidarDadosDeAtas(queryClient);
    }
    // Por último: usa os contratos e as atas que acabaram de ser atualizados.
    const saldos = await sincronizarSaldosItens();
    if (saldos.status === 'ERRO') console.warn('[sincronizacao] saldos dos itens:', saldos.erro);
    if (houveMudanca(saldos)) await invalidarDadosDeSaldosItens(queryClient);
  } catch (err) {
    console.warn('[sincronizacao] conferência interrompida:', err);
  } finally {
    conferindo = false;
  }
}

export function useSincronizacaoEmSegundoPlano() {
  const { role, user } = useAuth();
  const queryClient = useQueryClient();
  const habilitado = podeSincronizar(role) && Boolean(user?.id);

  useEffect(() => {
    if (!habilitado) return;
    void conferir(queryClient);
    const intervalo = setInterval(() => void conferir(queryClient), INTERVALO_SEGUNDO_PLANO_MS);
    return () => clearInterval(intervalo);
  }, [habilitado, user?.id, queryClient]);
}
