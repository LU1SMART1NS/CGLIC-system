import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useContratosFiscalizacao, useEntregasFiscalizacao } from '../../hooks/useFiscalizacao';
import { naoCarregou } from '../fonte/useLeiturasComFalha';
import { useTelaCarregada } from '../layout/useTelaCarregada';
import { hojeEmBrasilia } from '../../utils/fiscalizacao';
import { linhasDosContratos } from '../../utils/fiscalizacaoContratosLista';

/**
 * Número do menu Fiscalização (16/11/2026): contratos "Com você" da tela Contratos (a entrada do menu), os do fiscal
 * logado com o próximo passo dele; vermelho quando algum passo está vencido. Só o gestor de fiscalização, que abre a
 * tela já em "Com você" e filtrada nele (o coordenador e a consulta abrem em Todos, sem número).
 */
export function useContagemFiscalizacao(): { total: number; vencidos: number } | null {
  const { role, user } = useAuth();
  const telaCarregada = useTelaCarregada();
  const fiscal = role === 'gestor_fiscalizacao';
  // Mesmas consultas da tela Contratos e do Início do fiscal (cache compartilhado); esperam a tela aberta encher.
  const contratos = useContratosFiscalizacao({ enabled: telaCarregada && fiscal });
  const entregas = useEntregasFiscalizacao(null, { enabled: telaCarregada && fiscal });
  return useMemo(() => {
    if (!fiscal || !user || !contratos.data || !entregas.data || naoCarregou(contratos) || naoCarregou(entregas)) return null;
    const comVoce = linhasDosContratos(contratos.data, entregas.data, hojeEmBrasilia()).filter((l) => l.seg === 'VOCE' && l.c.fiscalUserId === user.id);
    return { total: comVoce.length, vencidos: comVoce.filter((l) => l.dias != null && l.dias < 0).length };
  }, [fiscal, user, contratos, entregas]);
}
