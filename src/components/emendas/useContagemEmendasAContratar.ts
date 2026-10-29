import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useEmendasAContratar } from '../../hooks/useEmendas';
import { enviosParaContratar } from '../../utils/emendasCcga';
import { naoCarregou } from '../fonte/useLeiturasComFalha';
import { useTelaCarregada } from '../layout/useTelaCarregada';

/**
 * Número do Início pelos pedidos de emenda a contratar (migration 248, D2): o gestor conta os das atas dele; o
 * coordenador, os das atas sem gestor. Mesma conta da gaveta "Emendas a contratar"; espera a tela aberta encher.
 */
export function useContagemEmendasAContratar(): number | null {
  const { role } = useAuth();
  const telaCarregada = useTelaCarregada();
  const consulta = useEmendasAContratar({ enabled: telaCarregada });
  return useMemo(() => {
    if ((role !== 'admin' && role !== 'gestor') || !consulta.data || naoCarregou(consulta)) return null;
    return enviosParaContratar(consulta.data, { coordenador: role === 'admin' }).aContratar.length;
  }, [role, consulta]);
}
