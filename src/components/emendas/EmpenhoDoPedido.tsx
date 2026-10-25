import React from 'react';
import { carteiraDetalhe } from '../carteira/carteiraStyles';
import { AvisosResolvidosLista, BotaoResolvido, useResolverAviso } from '../avisos/ResolverAviso';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { chaveAvisoEmpenho, ehDiferenca, fraseDaDiferenca } from '../../utils/emendasEmpenho';
import type { ConferenciaEmpenho, ItemCaep } from '../../services/emendasService';

interface Props {
  pedidoId: string;
  /** Conferência dos itens da emenda (migration 187); aqui entram só as diferenças em que o pedido aparece. */
  conferencia: ConferenciaEmpenho[];
  itens: Map<string, ItemCaep>;
  podeGerir: boolean;
}

/**
 * Empenhado × pedido no pedido aberto (protótipo aprovado em 25/10/2026): cada item em que a nota da emenda tem mais
 * ou menos que o pedido, com o ✓ Resolvido (justificativa) para o gestor de emendas e o coordenador. Corrigir o
 * pedido ou a reserva continua pelas janelas de sempre.
 */
export const EmpenhoDoPedido: React.FC<Props> = ({ pedidoId, conferencia, itens, podeGerir }) => {
  const doPedido = conferencia.filter((c) => ehDiferenca(c) && c.pedidoIds.includes(pedidoId));
  return doPedido.length ? <Diferencas pedidoId={pedidoId} doPedido={doPedido} itens={itens} podeGerir={podeGerir} /> : null;
};

const Diferencas: React.FC<{ pedidoId: string; doPedido: ConferenciaEmpenho[]; itens: Map<string, ItemCaep>; podeGerir: boolean }> = ({ pedidoId, doPedido, itens, podeGerir }) => {
  const { abrir, dialog, porChave, reexibir } = useResolverAviso();
  const pendentes = doPedido.filter((c) => !porChave.has(chaveAvisoEmpenho(c)));
  const resolvidas = doPedido.filter((c) => porChave.has(chaveAvisoEmpenho(c)));
  const titulo = (c: ConferenciaEmpenho) => `${c.situacao === 'A_MAIS' ? 'Empenhado a mais' : 'Empenhado a menos'} · ${fraseDaDiferenca(c, itens)}`;
  const contexto = (c: ConferenciaEmpenho) =>
    `Emenda ${c.emenda}${c.notas.length ? ` · ${c.notas.length === 1 ? 'nota' : 'notas'} ${c.notas.join(', ')}` : ' · nenhuma nota da emenda tem este item'}${c.pedidos.length > 1 ? ` · soma dos pedidos ${c.pedidos.join(', ')}` : ''}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }} data-testid={`emendas-pedido-empenho-${pedidoId}`}>
      {pendentes.map((c) => {
        const mais = c.situacao === 'A_MAIS';
        // Faixa de aviso padrão (NoticeBar): título curto, um detalhe de uma linha e o ✓ Resolvido ao lado.
        return (
          <NoticeBar
            key={chaveAvisoEmpenho(c)}
            tone={mais ? 'danger' : 'warning'}
            testId={`emendas-pedido-empenho-${c.itemKey}`}
            action={podeGerir ? <BotaoResolvido onClick={() => abrir({ tipo: 'AVISO', chave: chaveAvisoEmpenho(c), titulo: titulo(c), contexto: contexto(c) })} testId={`emendas-pedido-empenho-resolver-${c.itemKey}`} /> : undefined}
          >
            <span style={{ fontWeight: 700 }}>{titulo(c)}</span>
            <span style={{ ...carteiraDetalhe, color: 'inherit', opacity: 0.85, display: 'block' }}>
              {contexto(c)}. {mais ? 'Corrija o pedido ou a reserva.' : 'Confira se falta nota no SEI ou mande a diferença para a reserva.'}
            </span>
          </NoticeBar>
        );
      })}
      <AvisosResolvidosLista
        itens={resolvidas.map((c) => ({ chave: chaveAvisoEmpenho(c), titulo: titulo(c), contexto: contexto(c) }))}
        porChave={porChave}
        podeReexibir={podeGerir}
        onReexibir={(chave) => reexibir.mutate({ chave })}
        reexibindo={reexibir.isPending}
        testId={`emendas-pedido-empenho-resolvidos-${pedidoId}`}
      />
      {dialog}
    </div>
  );
};
