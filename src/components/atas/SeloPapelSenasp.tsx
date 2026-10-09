import React from 'react';
import type { ArpRecord } from '../../types';
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
  return (
    <span
      data-testid={testId}
      title={
        adesao
          ? `Ata da UASG ${arp.codigoUnidadeGerenciadora}: a SENASP fez adesão (não participou da compra).`
          : `Ata da UASG ${arp.codigoUnidadeGerenciadora}: a SENASP é participante, com quantidade própria registrada.`
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        fontSize: '0.7rem',
        fontWeight: 700,
        lineHeight: 1.3,
        padding: '0.1rem 0.5rem',
        borderRadius: '999px',
        whiteSpace: 'nowrap',
        color: 'var(--color-info-text-strong)',
        background: adesao ? 'transparent' : 'var(--color-info-bg)',
        border: `1px ${adesao ? 'dashed' : 'solid'} var(--color-info-border)`
      }}
    >
      {rotuloPapelSenasp(papel)}
      {comUasg && <span style={{ fontWeight: 600 }}>· UASG {arp.codigoUnidadeGerenciadora}</span>}
    </span>
  );
};
