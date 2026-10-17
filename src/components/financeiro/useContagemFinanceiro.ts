import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ROTULOS_FINANCEIRO, usePagamentosCarteira } from '../../hooks/useFinanceiroCarteira';
import { naoCarregou } from '../fonte/useLeiturasComFalha';
import { resumirPrecisaDeAcao } from '../../services/financeiroCarteiraService';
import { useContratosDoFinanceiro } from './useContratosDoFinanceiro';
import { useTelaCarregada } from '../layout/useTelaCarregada';

/**
 * Número no ícone do Financeiro: o segmento "Precisa de ação" de Pagamentos (ciclos com a CGLIC e faturas com erro no
 * SIAFI), urgente quando há erro no SIAFI ou prazo da CGLIC vencido. Coordenador vê todos; gestor, os próprios
 * contratos. As faturas (com a conferência do Tesouro), os ciclos e as ligações só são lidos depois que a tela aberta
 * enche (useTelaCarregada): são as consultas mais pesadas do menu e disputavam a fila do banco com o Início.
 */
export function useContagemFinanceiro(): { total: number; urgente: boolean } | null {
  const { role } = useAuth();
  const telaCarregada = useTelaCarregada();
  const ativo = role === 'admin' || role === 'gestor';
  const { rows, isLoading, leituras } = usePagamentosCarteira({ enabled: ativo && telaCarregada });
  const { escopo, isLoading: carregandoEscopo, contratosNaoCarregaram } = useContratosDoFinanceiro();
  // Uma leitura que falhou sem leitura anterior deixaria o número abaixo do real: o menu fica sem número. O aviso do
  // Tesouro não entra na conta, e os contratos só importam para o recorte do gestor.
  const algumaNaoCarregou =
    (leituras ?? []).some((l) => l.rotulo !== ROTULOS_FINANCEIRO.tesouro && naoCarregou(l.query)) || (role === 'gestor' && Boolean(contratosNaoCarregaram));
  return useMemo(() => {
    if (!ativo || !telaCarregada || isLoading || (role === 'gestor' && carregandoEscopo) || algumaNaoCarregou) return null;
    return resumirPrecisaDeAcao(escopo ? rows.filter((r) => escopo.has(r.contractKey)) : rows);
  }, [ativo, telaCarregada, role, rows, isLoading, escopo, carregandoEscopo, algumaNaoCarregou]);
}
