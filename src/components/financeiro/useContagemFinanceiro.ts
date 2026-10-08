import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePagamentosCarteira } from '../../hooks/useFinanceiroCarteira';
import { resumirPrecisaDeAcao } from '../../services/financeiroCarteiraService';
import { useContratosDoFinanceiro } from './useContratosDoFinanceiro';

/**
 * Número no ícone do Financeiro: o segmento "Precisa de ação" de Pagamentos (ciclos com a CGLIC e faturas com erro no
 * SIAFI), urgente quando há erro no SIAFI ou prazo da CGLIC vencido. Coordenador vê todos; gestor, os próprios
 * contratos. Consultas leves (faturas, ciclos em aberto), já usadas pelo número da Vinculação.
 */
export function useContagemFinanceiro(): { total: number; urgente: boolean } | null {
  const { role } = useAuth();
  const ativo = role === 'admin' || role === 'gestor';
  const { rows, isLoading } = usePagamentosCarteira({ enabled: ativo });
  const { escopo, isLoading: carregandoEscopo } = useContratosDoFinanceiro();
  return useMemo(() => {
    if (!ativo || isLoading || (role === 'gestor' && carregandoEscopo)) return null;
    return resumirPrecisaDeAcao(escopo ? rows.filter((r) => escopo.has(r.contractKey)) : rows);
  }, [ativo, role, rows, isLoading, escopo, carregandoEscopo]);
}
