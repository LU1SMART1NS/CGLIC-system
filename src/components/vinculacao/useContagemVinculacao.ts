import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useEmpenhosParaVincularAosItens } from '../../hooks/useVinculacaoEmpenhos';
import { useEmpenhosForaDoContrato } from '../../hooks/useEmpenhosForaDoContrato';
import { useContratosDoFinanceiro } from '../financeiro/useContratosDoFinanceiro';
import { aguardaVinculoAosItens, pedeOGestor } from './vinculacaoEmpenhos';

/**
 * Número no ícone do menu Vinculação, parte leve: as notas a vincular aos itens e as citadas fora do contrato que pedem o gestor. Só coordenador e
 * gestor (este, nos próprios contratos). Os contratos sem ata e os itens a alocar dependem da carteira inteira: vêm de
 * ContagensDaCarteira, só depois de a carteira estar no navegador.
 */
export function useContagemVinculacao(): { aosItens: number; aoContrato: number } | null {
  const { role } = useAuth();
  const ativo = role === 'admin' || role === 'gestor';
  const { data: notas } = useEmpenhosParaVincularAosItens(ativo);
  const { data: foraDoContrato } = useEmpenhosForaDoContrato(ativo);
  const { escopo, isLoading } = useContratosDoFinanceiro();

  return useMemo(() => {
    if (!ativo || !notas || !foraDoContrato || (role === 'gestor' && isLoading)) return null;
    const noEscopo = (contractKey: string) => !escopo || escopo.has(contractKey);
    const aosItens = notas.filter((d) => aguardaVinculoAosItens(d) && noEscopo(d.contractKey)).length;
    const aoContrato = foraDoContrato.filter((l) => pedeOGestor(l) && noEscopo(l.contractKey)).length;
    return { aosItens, aoContrato };
  }, [ativo, role, notas, foraDoContrato, escopo, isLoading]);
}
