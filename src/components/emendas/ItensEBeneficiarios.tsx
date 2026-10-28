import React from 'react';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { carteiraDetalhe, carteiraNumero } from '../carteira/carteiraStyles';
import { linhasDaLista } from '../../utils/emendasPedidos';
import type { ItemCaep, PedidoEmenda } from '../../services/emendasService';

/**
 * Coluna "Itens e beneficiários" das listas de pedidos (Pedidos, Parlamentar 360 e Emenda 360): uma linha por item,
 * "10× Carabina 5,56 mm → PMMG". Mostra 2 linhas; o resto vira "+N linhas", com a lista inteira na dica.
 */
export const ItensEBeneficiarios: React.FC<{ pedido: PedidoEmenda; itens: Map<string, ItemCaep>; beneficiarios: Map<string, { nome: string; sigla?: string | null }> }> = ({
  pedido,
  itens,
  beneficiarios
}) => {
  const todas = linhasDaLista(pedido, itens, beneficiarios);
  if (todas.length === 0) return <span style={carteiraDetalhe}>—</span>;
  const mostradas = todas.slice(0, 2);
  const resto = todas.length - mostradas.length;
  return (
    <>
      {mostradas.map((x) => (
        <div key={x.id} style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', minWidth: 0, maxWidth: '32rem' }}>
          <span style={{ ...carteiraNumero, fontWeight: 700, color: '#64748b', minWidth: '2.2em', textAlign: 'right', flex: '0 0 auto' }}>{x.quantidade}×</span>
          <span title={x.nome} style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: '0 1 auto' }}>
            {x.nome}
          </span>
          {x.kit && <StatusBadge label="Kit" variant="neutral" size="sm" dot={false} />}
          <span style={{ color: '#64748b', flex: '0 0 auto' }}>→</span>
          <span
            title={x.beneficiarioNome ?? undefined}
            style={{
              fontWeight: 600,
              color: x.beneficiario ? 'var(--color-primary, #0c326f)' : '#64748b',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '11rem',
              flex: '0 0 auto'
            }}
          >
            {x.beneficiario ?? 'a definir'}
          </span>
        </div>
      ))}
      {resto > 0 && (
        <div style={carteiraDetalhe} title={todas.map((x) => `${x.quantidade}× ${x.nome} → ${x.beneficiarioNome ?? 'a definir'}`).join('\n')}>
          +{resto} {resto === 1 ? 'linha' : 'linhas'}
        </div>
      )}
    </>
  );
};
