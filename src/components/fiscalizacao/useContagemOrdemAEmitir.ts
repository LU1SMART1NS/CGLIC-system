import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useEntregasFiscalizacao } from '../../hooks/useFiscalizacao';
import { naoCarregou } from '../fonte/useLeiturasComFalha';
import { useTelaCarregada } from '../layout/useTelaCarregada';

/**
 * Número do Início do fiscal (13/11/2026): itens com as informações da CAEP recebidas e a Ordem de Fornecimento a
 * emitir. É o envio à SFC, como o envio à CCGA conta no Início do gestor da ata. Só o gestor de fiscalização, nos
 * contratos dele (o coordenador vê o cartão no Painel da Fiscalização).
 */
export function useContagemOrdemAEmitir(): number | null {
  const { role, user } = useAuth();
  const telaCarregada = useTelaCarregada();
  // Só o fiscal lê (a lista é grande); espera a tela aberta encher, como as outras contagens do menu.
  const consulta = useEntregasFiscalizacao(null, { enabled: telaCarregada && role === 'gestor_fiscalizacao' });
  return useMemo(() => {
    if (role !== 'gestor_fiscalizacao' || !user || !consulta.data || naoCarregou(consulta)) return null;
    return consulta.data.filter((e) => e.responsavel === 'SFC' && e.etapa === 'INFO_ENVIADA' && e.fiscalUserId === user.id).length;
  }, [role, user, consulta]);
}
