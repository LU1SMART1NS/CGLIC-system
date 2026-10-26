import { useMemo } from 'react';
import {
  hojeEmBrasilia,
  useContatosDasEmendas,
  useCredorDiferente,
  useDiferencasDeEmpenho,
  useEmendasSiop,
  useItensCaep,
  useNotasDasLinhas,
  usePedidosEmendas,
  usePodeGerirEmendas
} from '../../hooks/useEmendas';
import { useAvisosResolvidos } from '../../hooks/useAvisosResolvidos';
import { avisosDosPedidosParaOMenu } from '../../utils/emendasInicio';
import { contaEmendasSemPedido, emendasNaLista } from '../../utils/emendasSemPedido';
import { naoCarregou } from '../fonte/useLeiturasComFalha';
import { useTelaCarregada } from '../layout/useTelaCarregada';

/**
 * Número no ícone de Emendas, no padrão do Financeiro: pedidos com algum aviso, vermelho quando algum tem aviso vermelho
 * (ata encerrada, prazo de indicação vencido, empenhado a mais, ofício devolvido, mais de 30 dias sem ofício), mais as
 * emendas vistas no SIOP e ainda sem pedido (vermelho quando passam do prazo sem contato, migration 205). Só para
 * quem altera as emendas (coordenador e gestor de emendas); a consulta não recebe número. As leituras esperam a tela
 * aberta encher (useTelaCarregada) e são as mesmas da lista de Pedidos, que as reaproveita do cache.
 */
export function useContagemEmendas(): { total: number; urgentes: number; semPedido: number } | null {
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
  const emendas = useEmendasSiop({ enabled });
  const contatos = useContatosDasEmendas({ enabled });
  const consultas = [pedidos, itens, notas, conferencia, credor, resolvidos, emendas, contatos];
  const carregando = consultas.some((q) => q.isLoading);
  // Uma leitura que falhou sem leitura anterior deixaria o número errado: o menu fica sem número.
  const algumaNaoCarregou = consultas.some(naoCarregou);
  const hoje = hojeEmBrasilia();
  return useMemo(() => {
    if (!enabled || carregando || algumaNaoCarregou || !pedidos.data || !itens.data || !notas.data) return null;
    const { comAviso, urgentes } = avisosDosPedidosParaOMenu(pedidos.data, itens.data, hoje, notas.data, diferencas, credorPendente);
    const sem = contaEmendasSemPedido(emendasNaLista(emendas.data ?? [], pedidos.data, contatos.data ?? [], hoje));
    return { total: comAviso + sem.total, urgentes: urgentes + sem.urgentes, semPedido: sem.total };
  }, [enabled, carregando, algumaNaoCarregou, pedidos.data, itens.data, notas.data, hoje, diferencas, credorPendente, emendas.data, contatos.data]);
}
