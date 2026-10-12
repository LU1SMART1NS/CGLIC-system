import React from 'react';
import type { ArpRecord } from '../../types';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { ataDeOutroOrgao, papelSenaspDaAta, rotuloPapelSenasp } from '../../utils/ataIdentidade';

/**
 * Selo das atas de outros órgãos em que a SENASP é participante ou fez adesão (migration 106), com a UASG
 * gerenciadora. Atas da CGLIC não mostram selo (é o caso comum).
 */
export const SeloPapelSenasp: React.FC<{
  arp: Pick<ArpRecord, 'codigoUnidadeGerenciadora' | 'papelSenasp'>;
  /** Mostra a UASG gerenciadora junto (padrão: sim). */
  comUasg?: boolean;
  testId?: string;
}> = ({ arp, comUasg = true, testId }) => {
  if (!ataDeOutroOrgao(arp)) return null;
  const papel = papelSenaspDaAta(arp);
  const adesao = papel === 'ADESAO';
  // Selo padrão (StatusBadge): participante em azul, adesão em cinza; a explicação fica no tooltip.
  return (
    <span
      data-testid={testId}
      title={
        adesao
          ? `Ata da UASG ${arp.codigoUnidadeGerenciadora}: a SENASP fez adesão (não participou da compra).`
          : `Ata da UASG ${arp.codigoUnidadeGerenciadora}: a SENASP é participante, com quantidade própria registrada.`
      }
      style={{ display: 'inline-flex' }}
    >
      <StatusBadge
        label={comUasg ? `${rotuloPapelSenasp(papel)} · UASG ${arp.codigoUnidadeGerenciadora}` : rotuloPapelSenasp(papel)}
        variant={adesao ? 'neutral' : 'info'}
        size="sm"
        dot={false}
      />
    </span>
  );
};
