import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useEmpenhosParaVincularAosItens, useContratosComEmpenhosConsultados } from '../../hooks/useVinculacaoEmpenhos';
import { useFaturasCarteira } from '../../hooks/useFinanceiroCarteira';
import { useContratosDoFinanceiro } from '../financeiro/useContratosDoFinanceiro';
import { aguardaVinculoAosItens, empenhosCitadosSemVinculo } from './vinculacaoEmpenhos';

/**
 * Número no ícone do menu Vinculação, parte leve: as notas que o perfil pode vincular (aos itens e ao contrato). Só coordenador e
 * gestor (este, nos próprios contratos). Os contratos sem ata e os itens a alocar dependem da carteira inteira: vêm de
 * ContagensDaCarteira, só depois de a carteira estar no navegador.
 */
export function useContagemVinculacao(): { aosItens: number; aoContrato: number } | null {
  const { role } = useAuth();
  const ativo = role === 'admin' || role === 'gestor';
  const { data: notas } = useEmpenhosParaVincularAosItens(ativo);
  const faturas = useFaturasCarteira({ enabled: ativo });
  const { data: consultados } = useContratosComEmpenhosConsultados(ativo);
  const { escopo, isLoading } = useContratosDoFinanceiro();

  return useMemo(() => {
    if (!ativo || !notas || !faturas.data || !consultados || (role === 'gestor' && isLoading)) return null;
    const noEscopo = (contractKey: string) => !escopo || escopo.has(contractKey);
    const aosItens = notas.filter((d) => aguardaVinculoAosItens(d) && noEscopo(d.contractKey)).length;
    const aoContrato = empenhosCitadosSemVinculo(faturas.data, consultados).filter((l) => noEscopo(l.fatura.contractKey)).length;
    return { aosItens, aoContrato };
  }, [ativo, role, notas, faturas.data, consultados, escopo, isLoading]);
}
