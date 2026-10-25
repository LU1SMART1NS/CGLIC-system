import { useMemo } from 'react';
import {
  hojeEmBrasilia,
  useCredorDiferente,
  useDiferencasDeEmpenho,
  useItensCaep,
  useNotasDasLinhas,
  usePedidosEmendas,
  usePodeGerirEmendas
} from '../../hooks/useEmendas';
import { useAvisosResolvidos } from '../../hooks/useAvisosResolvidos';
import { avisosDosPedidosParaOMenu } from '../../utils/emendasInicio';
import { naoCarregou } from '../fonte/useLeiturasComFalha';
import { useTelaCarregada } from '../layout/useTelaCarregada';

/**
 * Número no ícone de Emendas, no padrão do Financeiro: pedidos com algum aviso, vermelho quando algum tem aviso vermelho
 * (ata encerrada, prazo de indicação vencido, empenhado a mais, ofício devolvido, mais de 30 dias sem ofício). Só para
 * quem altera as emendas (coordenador e gestor de emendas); a consulta não recebe número. As leituras esperam a tela
 * aberta encher (useTelaCarregada) e são as mesmas da lista de Pedidos, que as reaproveita do cache.
 */
export function useContagemEmendas(): { total: number; urgentes: number } | null {
  const ativo = usePodeGerirEmendas();
  const telaCarregada = useTelaCarregada();
  const enabled = ativo && telaCarregada;
  const pedidos = usePedidosEmendas({ enabled });
  const itens = useItensCaep({ enabled });
  const notas = useNotasDasLinhas({ enabled });
  const { consulta: conferencia, diferencas } = useDiferencasDeEmpenho({ enabled });
  const { consulta: credor, porPedido: credorPendente } = useCredorDiferente({ enabled });
  // Sem os resolvidos, um aviso já resolvido (empenhado a mais ou a menos, outro fornecedor) voltaria a contar.
  const { consulta: resolvidos } = useAvisosResolvidos();
  const consultas = [pedidos, itens, notas, conferencia, credor, resolvidos];
  const carregando = consultas.some((q) => q.isLoading);
  // Uma leitura que falhou sem leitura anterior deixaria o número errado: o menu fica sem número.
  const algumaNaoCarregou = consultas.some(naoCarregou);
  const hoje = hojeEmBrasilia();
  return useMemo(() => {
    if (!enabled || carregando || algumaNaoCarregou || !pedidos.data || !itens.data || !notas.data) return null;
    const { comAviso, urgentes } = avisosDosPedidosParaOMenu(pedidos.data, itens.data, hoje, notas.data, diferencas, credorPendente);
    return { total: comAviso, urgentes };
  }, [enabled, carregando, algumaNaoCarregou, pedidos.data, itens.data, notas.data, hoje, diferencas, credorPendente]);
}
