import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useEmpenhosParaVincularAosItens } from '../../hooks/useVinculacaoEmpenhos';
import { useEmpenhosForaDoContrato } from '../../hooks/useEmpenhosForaDoContrato';
import { useNotasForaDoContrato } from '../../hooks/useNotasForaDoContrato';
import { contratoIndicado, notaNoSegmento } from './notasForaDoContrato';
import { useContratosDoFinanceiro } from '../financeiro/useContratosDoFinanceiro';
import { useTelaCarregada } from '../layout/useTelaCarregada';
import { aguardaVinculoAosItens, contaNoMenu, pedeOGestor } from './vinculacaoEmpenhos';

/**
 * Número no ícone do menu Vínculos, parte leve: as notas a vincular aos itens e as citadas fora do contrato que pedem o gestor,
 * só de contratos vigentes (as de contrato encerrado ficam no filtro "Encerrados" das filas; decisão de 15/10/2026). Só
 * coordenador e gestor (este, nos próprios contratos). Os contratos sem ata e os itens a alocar dependem da carteira inteira:
 * vêm de ContagensDaCarteira, só depois de a carteira estar no navegador. As filas só são lidas depois que a tela aberta
 * enche (useTelaCarregada), para não disputar a fila do banco com ela.
 */
export function useContagemVinculacao(): { aosItens: number; aoContrato: number; notasForaDoContrato: number } | null {
  const { role } = useAuth();
  const telaCarregada = useTelaCarregada();
  const ativo = (role === 'admin' || role === 'gestor') && telaCarregada;
  const { data: notas } = useEmpenhosParaVincularAosItens(ativo);
  const { data: foraDoContrato } = useEmpenhosForaDoContrato(ativo);
  const { data: notasFora } = useNotasForaDoContrato(ativo);
  // Sem os contratos (vigência e, no gestor, o recorte), o número sairia errado: o menu fica sem número.
  // Os contratos também esperam a tela encher (eram a carteira inteira lida ao abrir qualquer tela).
  const { contrato, escopo, isLoading, contratosNaoCarregaram } = useContratosDoFinanceiro({ enabled: ativo });

  return useMemo(() => {
    // Sem a carteira não dá para saber quais contratos estão encerrados: o número espera, em vez de mudar depois.
    if (!ativo || !notas || !foraDoContrato || !notasFora || isLoading || contratosNaoCarregaram) return null;
    const conta = (contractKey: string) => (!escopo || escopo.has(contractKey)) && contaNoMenu(contrato(contractKey).expirado);
    const aosItens = notas.filter((d) => aguardaVinculoAosItens(d) && conta(d.contractKey)).length;
    const aoContrato = foraDoContrato.filter((l) => pedeOGestor(l) && conta(l.contractKey)).length;
    // Notas fora do contrato (migration 256): "A incluir", pelo contrato indicado (o do gestor, no perfil gestor).
    const notasForaDoContrato = notasFora.filter((n) => {
      const k = contratoIndicado(n);
      return notaNoSegmento(n, 'A_INCLUIR') && (k ? conta(k) : !escopo);
    }).length;
    return { aosItens, aoContrato, notasForaDoContrato };
  }, [ativo, notas, foraDoContrato, notasFora, escopo, isLoading, contratosNaoCarregaram, contrato]);
}
