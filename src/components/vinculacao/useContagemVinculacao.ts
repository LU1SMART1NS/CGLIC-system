import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useEmpenhosParaVincularAosItens } from '../../hooks/useVinculacaoEmpenhos';
import { useEmpenhosForaDoContrato } from '../../hooks/useEmpenhosForaDoContrato';
import { useContratosDoFinanceiro } from '../financeiro/useContratosDoFinanceiro';
import { aguardaVinculoAosItens, contaNoMenu, pedeOGestor } from './vinculacaoEmpenhos';

/**
 * Número no ícone do menu Vínculos, parte leve: as notas a vincular aos itens e as citadas fora do contrato que pedem o gestor,
 * só de contratos vigentes (as de contrato encerrado ficam no filtro "Encerrados" das filas; decisão de 15/10/2026). Só
 * coordenador e gestor (este, nos próprios contratos). Os contratos sem ata e os itens a alocar dependem da carteira inteira:
 * vêm de ContagensDaCarteira, só depois de a carteira estar no navegador.
 */
export function useContagemVinculacao(): { aosItens: number; aoContrato: number } | null {
  const { role } = useAuth();
  const ativo = role === 'admin' || role === 'gestor';
  const { data: notas } = useEmpenhosParaVincularAosItens(ativo);
  const { data: foraDoContrato } = useEmpenhosForaDoContrato(ativo);
  const { contrato, escopo, isLoading } = useContratosDoFinanceiro();

  return useMemo(() => {
    // Sem a carteira não dá para saber quais contratos estão encerrados: o número espera, em vez de mudar depois.
    if (!ativo || !notas || !foraDoContrato || isLoading) return null;
    const conta = (contractKey: string) => (!escopo || escopo.has(contractKey)) && contaNoMenu(contrato(contractKey).expirado);
    const aosItens = notas.filter((d) => aguardaVinculoAosItens(d) && conta(d.contractKey)).length;
    const aoContrato = foraDoContrato.filter((l) => pedeOGestor(l) && conta(l.contractKey)).length;
    return { aosItens, aoContrato };
  }, [ativo, notas, foraDoContrato, escopo, isLoading, contrato]);
}
