import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useContratosFiscalizacao, useEntregasFiscalizacao } from '../../hooks/useFiscalizacao';
import { naoCarregou } from '../fonte/useLeiturasComFalha';
import { ETAPA_DO_MENU, useEtapaDoMenu } from '../layout/useTelaCarregada';
import { hojeEmBrasilia } from '../../utils/fiscalizacao';
import { linhasDosContratos, type LinhaContrato } from '../../utils/fiscalizacaoContratosLista';

/**
 * Conta do número do menu sobre as linhas da tela Contratos (aba "Com você" / "Com o fiscal"). Com `fiscalUserId`, só
 * os contratos desse fiscal (a tela do fiscal abre filtrada nele); sem, os de todos os fiscais (a tela do coordenador).
 */
export function contarFiscalizacaoDoMenu(linhas: LinhaContrato[], fiscalUserId: string | null): { total: number; vencidos: number } {
  const comOFiscal = linhas.filter((l) => l.seg === 'VOCE' && (!fiscalUserId || l.c.fiscalUserId === fiscalUserId));
  return { total: comOFiscal.length, vencidos: comOFiscal.filter((l) => l.dias != null && l.dias < 0).length };
}

/**
 * Número do menu Fiscalização: os contratos da aba "Com você" / "Com o fiscal" da tela Contratos (a entrada do menu),
 * vermelho quando algum passo está vencido.
 * - Gestor de fiscalização (16/11/2026): os dele, como a tela, que já abre em "Com você" e filtrada nele.
 * - Coordenador (18/11/2026, pedido do usuário: "como ocorre com os outros menus"): os de todos os fiscais, como o
 *   "Precisa de ação" do Financeiro; o clique abre a tela em "Com o fiscal".
 * - Consulta: sem número, como nos outros menus.
 */
export function useContagemFiscalizacao(): { total: number; vencidos: number } | null {
  const { role, user } = useAuth();
  const telaCarregada = useEtapaDoMenu(ETAPA_DO_MENU.financeiro);
  const fiscal = role === 'gestor_fiscalizacao';
  const ativo = fiscal || role === 'admin';
  // Mesmas consultas da tela Contratos e do Início do fiscal (cache compartilhado); esperam a etapa do menu.
  const contratos = useContratosFiscalizacao({ enabled: telaCarregada && ativo });
  const entregas = useEntregasFiscalizacao(null, { enabled: telaCarregada && ativo });
  return useMemo(() => {
    if (!ativo || !user || !contratos.data || !entregas.data || naoCarregou(contratos) || naoCarregou(entregas)) return null;
    return contarFiscalizacaoDoMenu(linhasDosContratos(contratos.data, entregas.data, hojeEmBrasilia()), fiscal ? user.id : null);
  }, [ativo, fiscal, user, contratos, entregas]);
}
