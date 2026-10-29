import React, { useState } from 'react';
import { AppButton } from '../../../design-system/components/AppButton';
import { ConfirmDialog } from '../../../design-system/components/ConfirmDialog';
import { NoticeBar } from '../../../design-system/components/NoticeBar';
import { StatusBadge } from '../../../design-system/components/StatusBadge';
import { useToast } from '../../../design-system/components/Toast';
import { carteiraDetalhe, carteiraNumero } from '../../carteira/carteiraStyles';
import { useLigarReservaAEmenda } from '../../../hooks/useEmendas';
import { formatCurrency } from '../../../utils/format';
import { linhasAtivas, ROTULO_ETAPA } from '../../../utils/emendasPedidos';
import { numeroDaEmenda } from '../../../utils/emendasSemPedido';
import { nomeDoPedido } from '../../../utils/emendasNomeDoPedido';
import type { EmendaSiop, PedidoEmenda } from '../../../services/emendasService';

interface Props {
  emenda: EmendaSiop;
  /** De reservasParaLigar: do mesmo parlamentar, sem o nº da emenda. */
  reservas: PedidoEmenda[];
  podeGerir: boolean;
  valorDe?: (p: PedidoEmenda) => number;
  onAbrirPedido: (id: string) => void;
  testId: string;
}

/**
 * Emenda sem pedido com reserva do mesmo parlamentar ainda sem o nº (29/10/2026): a tela sugere e a CAEP confirma a
 * ligação. A reserva passa a ser o pedido da emenda; a conferência com o SIOP continua na etapa do pedido.
 */
export const ReservasParaLigar: React.FC<Props> = ({ emenda, reservas, podeGerir, valorDe, onAbrirPedido, testId }) => {
  const toast = useToast();
  const ligar = useLigarReservaAEmenda();
  const [escolhida, setEscolhida] = useState<PedidoEmenda | null>(null);
  if (reservas.length === 0) return null;
  const emTexto = `${numeroDaEmenda(emenda.numero)} / ${emenda.ano}`;

  return (
    <NoticeBar tone="info" testId={testId}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <span>
          {reservas.length === 1 ? 'O parlamentar tem uma reserva' : `O parlamentar tem ${reservas.length} reservas`} ainda sem o nº da emenda.
          {podeGerir ? ' Se for desta emenda, ligue aqui.' : ' A CAEP confirma se é desta emenda.'}
        </span>
        {reservas.map((p) => {
          const itens = linhasAtivas(p).length;
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }} data-testid={`${testId}-${p.id}`}>
              <AppButton size="xs" variant="link" onClick={() => onAbrirPedido(p.id)}>
                {nomeDoPedido(p)}
              </AppButton>
              <StatusBadge label={ROTULO_ETAPA[p.etapa]} variant="info" size="sm" dot={false} />
              <span style={carteiraDetalhe}>{itens === 1 ? '1 item' : `${itens} itens`}</span>
              {valorDe && <span style={carteiraNumero}>{formatCurrency(valorDe(p))}</span>}
              {podeGerir && (
                <AppButton size="xs" onClick={() => setEscolhida(p)} data-testid={`${testId}-ligar-${p.id}`}>
                  Ligar a esta emenda
                </AppButton>
              )}
            </div>
          );
        })}
      </div>
      {escolhida && (
        <ConfirmDialog
          isOpen
          title={`Ligar a ${nomeDoPedido(escolhida).toLowerCase()} à emenda ${emTexto}?`}
          message="A reserva passa a ser o pedido desta emenda, ganha o número no ano e a emenda sai do aviso de sem pedido. A conferência com o SIOP continua na etapa do pedido."
          confirmLabel="Ligar"
          isLoading={ligar.isPending}
          onCancel={() => setEscolhida(null)}
          onConfirm={async () => {
            try {
              await ligar.mutateAsync({ pedidoId: escolhida.id, versao: escolhida.versao, emendaId: emenda.id });
              toast.success(`Reserva ligada à emenda ${emTexto}.`);
              setEscolhida(null);
            } catch (err) {
              toast.error((err as Error).message);
            }
          }}
        />
      )}
    </NoticeBar>
  );
};
