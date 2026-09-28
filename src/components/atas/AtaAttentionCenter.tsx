import React from 'react';
import { CheckCircle2, Lightbulb, AlertTriangle } from 'lucide-react';
import type { ArpRecord } from '../../types';
import { buildCentralPrazosItems } from '../../services/centralPrazosService';
import { classifyArpItemSaldo } from '../../services/balanceService';
import { SeverityBadge } from '../../design-system/components/SeverityBadge';

interface AtaAttentionCenterProps {
  arp: ArpRecord;
  saldos: Array<{
    numero_item?: number | string;
    descricao_item?: string;
    percentual_consumido?: number;
  }>;
  isLoading?: boolean;
}

/** Lembretes de planejamento (180d/90d) + itens com saldo crítico, no mesmo espírito do ContractAttentionCenter. */
export const AtaAttentionCenter: React.FC<AtaAttentionCenterProps> = ({ arp, saldos, isLoading = false }) => {
  const itensCriticos = React.useMemo(
    () =>
      saldos
        .map((item) => ({ item, classificacao: classifyArpItemSaldo(Number(item.percentual_consumido) || 0) }))
        .filter(({ classificacao }) => classificacao.isCritico),
    [saldos]
  );

  const lembretesPlanejamento = React.useMemo(
    () =>
      buildCentralPrazosItems({ arps: [arp] }).filter(
        (i) =>
          i.tipoItem === 'GATILHO_OPERACIONAL' &&
          (i.estadoTemporal === 'ATRASADO' || (i.diasRestantes >= 0 && i.diasRestantes <= 90))
      ),
    [arp]
  );

  if (isLoading) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
        Carregando pendências da Ata...
      </div>
    );
  }

  const hasNoItens = itensCriticos.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {hasNoItens ? (
        <div
          style={{
            background: '#f0fdf4',
            borderRadius: '10px',
            border: '1px solid #bbf7d0',
            padding: '1.5rem',
            textAlign: 'center',
            color: '#166534'
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: '#dcfce7',
              color: '#15803d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 0.75rem auto'
            }}
          >
            <CheckCircle2 size={22} />
          </div>
          <h4 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 0.35rem 0', color: '#14532d' }}>
            Saldo físico sob controle
          </h4>
          <p style={{ fontSize: '0.85rem', color: '#166534', margin: 0 }}>
            Nenhum item desta Ata está com consumo crítico (≥70%) no momento.
          </p>
        </div>
      ) : (
        itensCriticos.map(({ item, classificacao }) => (
          <div
            key={`${item.numero_item}`}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '1rem',
              padding: '1rem 1.25rem',
              borderRadius: '8px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ flex: 1, minWidth: '280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <SeverityBadge severity={classificacao.severity} customLabel={`${classificacao.percentualConsumido.toFixed(1)}% consumido`} />
                <AlertTriangle size={14} color="#dc2626" />
              </div>
              <h4 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Item {item.numero_item}: {item.descricao_item || 'Item de Ata de Registro de Preços'}
              </h4>
            </div>
          </div>
        ))
      )}

      {lembretesPlanejamento.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 700, color: '#64748b' }}>
            <Lightbulb size={14} />
            <span>Lembretes de Planejamento</span>
          </div>
          {lembretesPlanejamento.map((item) => {
            const isPast = item.estadoTemporal === 'ATRASADO';
            const prazoLabel = isPast
              ? `Janela iniciada há ${Math.abs(item.diasRestantes)} dias`
              : item.diasRestantes === 0
              ? 'Janela inicia hoje'
              : `Janela em ${item.diasRestantes} dias`;

            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.2rem',
                  padding: '0.85rem 1.1rem',
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0'
                }}
              >
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    color: '#475569',
                    background: '#f1f5f9',
                    padding: '0.1rem 0.45rem',
                    borderRadius: '4px',
                    alignSelf: 'flex-start'
                  }}
                >
                  {prazoLabel}
                </span>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155', margin: 0 }}>{item.regraNome}</h4>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>{item.acaoDescricao}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
