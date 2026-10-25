import React from 'react';
import { carteiraDetalhe } from '../carteira/carteiraStyles';
import { AvisosResolvidosLista, BotaoResolvido, useResolverAviso } from '../avisos/ResolverAviso';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { chaveAvisoCredor, contextoCredor, tituloCredor, type CredorNoPedido } from '../../utils/emendasConferenciaNota';
import type { ItemCaep } from '../../services/emendasService';

interface Props {
  pedidoId: string;
  /** Todas as notas de outro fornecedor do pedido (migration 190), resolvidas ou não. */
  grupos: CredorNoPedido[];
  itens: Map<string, ItemCaep>;
  podeGerir: boolean;
}

/**
 * Nota de outro fornecedor no pedido aberto (M7 da revisão de 25/10/2026): a nota ligada às linhas tem credor diferente
 * do fornecedor da ata do item. Corrigir é trocar o item ou a ata do pedido, ou a nota no contrato; quando estiver
 * certo, o ✓ Resolvido (justificativa) para o gestor de emendas e o coordenador.
 */
export const CredorDoPedido: React.FC<Props> = ({ pedidoId, grupos, itens, podeGerir }) =>
  grupos.length ? <Notas pedidoId={pedidoId} grupos={grupos} itens={itens} podeGerir={podeGerir} /> : null;

const Notas: React.FC<Props> = ({ pedidoId, grupos, itens, podeGerir }) => {
  const { abrir, dialog, porChave, reexibir } = useResolverAviso();
  const pendentes = grupos.filter((g) => !porChave.has(chaveAvisoCredor(g)));
  const resolvidas = grupos.filter((g) => porChave.has(chaveAvisoCredor(g)));
  const titulo = (g: CredorNoPedido) => `Nota de outro fornecedor · ${tituloCredor(g)}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }} data-testid={`emendas-pedido-credor-${pedidoId}`}>
      {pendentes.map((g) => (
        <NoticeBar
          key={chaveAvisoCredor(g)}
          tone="warning"
          testId={`emendas-pedido-credor-${g.nota}`}
          action={podeGerir ? <BotaoResolvido onClick={() => abrir({ tipo: 'AVISO', chave: chaveAvisoCredor(g), titulo: titulo(g), contexto: contextoCredor(g, itens) })} testId={`emendas-pedido-credor-resolver-${g.nota}`} /> : undefined}
        >
          <span style={{ fontWeight: 700 }}>{titulo(g)}</span>
          <span style={{ ...carteiraDetalhe, color: 'inherit', opacity: 0.85, display: 'block' }}>
            {contextoCredor(g, itens)}. Confira o item, a ata ou a nota ligada a ele.
          </span>
        </NoticeBar>
      ))}
      <AvisosResolvidosLista
        itens={resolvidas.map((g) => ({ chave: chaveAvisoCredor(g), titulo: titulo(g), contexto: contextoCredor(g, itens) }))}
        porChave={porChave}
        podeReexibir={podeGerir}
        onReexibir={(chave) => reexibir.mutate({ chave })}
        reexibindo={reexibir.isPending}
        testId={`emendas-pedido-credor-resolvidos-${pedidoId}`}
      />
      {dialog}
    </div>
  );
};
