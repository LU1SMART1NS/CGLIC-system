import React from 'react';
import { Check } from 'lucide-react';
import { AlertCard, AppButton, StatusBadge } from '../../design-system';
import { formatNumber } from './itemBalanceUtils';
import type { ItemExecutionSummary, ReferenciaComprasGovStatus } from '../../utils/itemExecutionSummary';

export interface ComprasGovReferencia {
  status: ReferenciaComprasGovStatus;
  /** Consumo do item informado pelo Compras.gov. */
  consumido?: number;
  /** Compras.gov menos contratado. */
  delta: number;
}

interface ItemExecutionSummaryStripProps {
  summary: ItemExecutionSummary;
  referencia: ComprasGovReferencia;
  loading?: boolean;
  /** Gestor ou admin: pode aceitar as sugestões de quantidade. */
  canEdit?: boolean;
  /** Empenhos pendentes que têm quantidade sugerida (podem ser aceitos de uma vez). */
  aceitaveis?: number;
  onAcceptAll?: () => void;
  busy?: boolean;
}

const Item: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone }) => (
  <span>
    {label} <strong style={{ color: tone }}>{value}</strong> <span style={{ color: 'var(--text-muted)' }}>un</span>
  </span>
);

/**
 * Resumo do item em uma linha: o consumo da ata é o contratado (quantidade lida da API nos contratos vinculados)
 * e o empenho é a execução desse contratado. Saldo da ata e homologado ficam no topo do item.
 * O Compras.gov aparece só como aviso, e só quando registra mais consumo do que os contratos cobrem.
 */
export const ItemExecutionSummaryStrip: React.FC<ItemExecutionSummaryStripProps> = ({
  summary,
  referencia,
  loading = false,
  canEdit = false,
  aceitaveis = 0,
  onAcceptAll,
  busy = false
}) => {
  const s = summary;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} data-testid="item-execution-summary">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem 1.5rem', fontSize: '0.9rem' }}>
        {loading ? (
          <span style={{ color: 'var(--text-secondary)' }}>Carregando contratos e empenhos...</span>
        ) : (
          <>
            <Item label="Contratado" value={formatNumber(s.contratado)} />
            <Item label="Empenhado" value={formatNumber(s.empenhado)} />
            <Item label="A empenhar" value={formatNumber(s.aEmpenhar)} tone={s.aEmpenhar < 0 ? 'var(--danger)' : undefined} />
            {s.contratosSemQuantidade > 0 && (
              <StatusBadge
                label={`${s.contratosSemQuantidade} ${s.contratosSemQuantidade === 1 ? 'contrato' : 'contratos'} sem quantidade lida da API`}
                variant="warning"
                size="sm"
                dot={false}
              />
            )}
          </>
        )}
      </div>

      {!loading && s.pendentes > 0 && (
        <div
          data-testid="empenhos-pendentes-banner"
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem',
            padding: '0.6rem 0.9rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '0.85rem'
          }}
        >
          <span style={{ color: '#92400e' }}>
            <strong>{s.pendentes}</strong> {s.pendentes === 1 ? 'empenho pendente de confirmação' : 'empenhos pendentes de confirmação'}
            {s.pendentesSugerido > 0 && <> ({formatNumber(s.pendentesSugerido)} un sugeridas pelo valor)</>}. Não entram no empenhado até serem confirmados.
          </span>
          {canEdit && aceitaveis > 0 && onAcceptAll && (
            <AppButton variant="outline" size="sm" icon={<Check size={13} />} onClick={onAcceptAll} disabled={busy}>
              Aceitar todas as sugestões do item
            </AppButton>
          )}
        </div>
      )}

      {referencia.status === 'ACIMA' && (
        <AlertCard
          severity="ATENCAO"
          title="O Compras.gov registra mais consumo do que os contratos vinculados"
          description={`O Compras.gov informa ${formatNumber(referencia.consumido ?? 0)} un consumidas neste item; os contratos vinculados somam ${formatNumber(s.contratado)} un (diferença de ${formatNumber(referencia.delta)} un). Pode haver consumo sem contrato vinculado. Esta é só uma referência e não altera o saldo da ata.`}
          originSource="Compras.gov.br"
          testId="alert-compras-gov-acima"
        />
      )}
    </div>
  );
};
