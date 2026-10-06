import React from 'react';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppButton } from '../../design-system/components/AppButton';
import { colors, shapes } from '../../design-system/tokens';
import type { BatchSyncProgress, BatchSyncSummary } from '../../hooks/useBatchSyncContractEmpenhos';

/** Quantas falhas do lote aparecem listadas no aviso; as demais são só contadas. */
const FALHAS_VISIVEIS = 8;

export interface EmpenhosBatchSyncPanelProps {
  isSyncingAll: boolean;
  batchProgress: BatchSyncProgress | null;
  batchSummary: BatchSyncSummary | null;
  isAuthorizedToSync: boolean;
  onCancel: () => void;
  onRetryFailed: () => void;
  onClose: () => void;
  onOpenContract: (contractKey: string) => void;
}

/**
 * Aviso da sincronização em lote dos empenhos: andamento, resumo por situação e a lista dos
 * contratos que falharam, com o botão para tentar de novo só esses.
 */
export const EmpenhosBatchSyncPanel: React.FC<EmpenhosBatchSyncPanelProps> = ({
  isSyncingAll,
  batchProgress,
  batchSummary,
  isAuthorizedToSync,
  onCancel,
  onRetryFailed,
  onClose,
  onOpenContract
}) => {
  const falhasDoLote = batchSummary?.falhas ?? [];
  const divergentesPncp = batchSummary?.divergentesPncp ?? [];
  const batchTone = !batchSummary ? colors.semantic.info : falhasDoLote.length > 0 ? colors.semantic.warning : colors.semantic.success;

  return (
    <div
      role="status"
      data-testid="financial-execution-batch-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
        padding: '0.75rem 1rem',
        marginBottom: '1.25rem',
        borderRadius: shapes.radius.md,
        border: `1px solid ${batchTone.border}`,
        backgroundColor: batchTone.bg,
        color: batchTone.text
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem', fontWeight: 600 }}>
          {isSyncingAll ? (
            <>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              <span>
                {batchProgress?.novaTentativa ? 'Nova tentativa dos que não responderam' : 'Sincronizando contratos'}{' '}
                {batchProgress?.current ?? 0}/{batchProgress?.total ?? 0}
                {batchProgress?.percent !== undefined ? ` (${batchProgress.percent}%)` : ''}
              </span>
            </>
          ) : batchSummary ? (
            <>
              {falhasDoLote.length > 0 ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
              <span data-testid="financial-execution-batch-summary">
                Sincronização {batchSummary.cancelado ? 'cancelada' : 'concluída'} de {batchSummary.totalContratos}{' '}
                contrato(s): {batchSummary.atualizados} atualizado(s), {batchSummary.semEmpenhos} sem empenho na fonte
                {batchSummary.parciais > 0 ? `, ${batchSummary.parciais} parcial(is)` : ''}
                {batchSummary.comErro > 0 ? `, ${batchSummary.comErro} com falha` : ''}.{' '}
                {batchSummary.empenhosPersistidos} empenho(s) gravado(s).
                {batchSummary.novasTentativas > 0 ? ` ${batchSummary.novasTentativas} contrato(s) tiveram nova tentativa.` : ''}
              </span>
            </>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isSyncingAll && <ActionButton action="cancelar" size="sm" onClick={onCancel} />}
          {!isSyncingAll && falhasDoLote.length > 0 && (
            <ActionButton
              action="sincronizar"
              size="sm"
              label={`Tentar de novo ${falhasDoLote.length === 1 ? 'o que falhou' : `os ${falhasDoLote.length} que falharam`}`}
              onClick={onRetryFailed}
              disabled={!isAuthorizedToSync}
              data-testid="financial-execution-batch-retry"
            />
          )}
          {!isSyncingAll && (
            <ActionButton
              action="fechar"
              iconOnly
              type="button"
              label="Fechar notificação"
              onClick={onClose}
            />
          )}
        </div>
      </div>

      {!isSyncingAll && falhasDoLote.length > 0 && (
        <ul data-testid="financial-execution-batch-falhas" style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', fontWeight: 400 }}>
          {falhasDoLote.slice(0, FALHAS_VISIVEIS).map((f) => (
            <li key={f.contractKey}>
              <AppButton variant="link" size="xs" type="button" onClick={() => onOpenContract(f.contractKey)}>
                {f.numero} (UASG {f.uasg})
              </AppButton>
              {f.situacao === 'PARCIAL' ? ' parcial: ' : ': '}
              {f.erro}
            </li>
          ))}
          {falhasDoLote.length > FALHAS_VISIVEIS && <li>e mais {falhasDoLote.length - FALHAS_VISIVEIS} contrato(s).</li>}
        </ul>
      )}

      {!isSyncingAll && divergentesPncp.length > 0 && (
        <div data-testid="financial-execution-batch-pncp" style={{ fontSize: '0.8rem', fontWeight: 400 }}>
          <strong>
            {divergentesPncp.length} contrato(s) com empenho no PNCP que não está no Contratos.gov.br
          </strong>{' '}
          (nada foi gravado a partir do PNCP; confira no contrato):
          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
            {divergentesPncp.slice(0, FALHAS_VISIVEIS).map((d) => (
              <li key={d.contractKey}>
                <AppButton variant="link" size="xs" type="button" onClick={() => onOpenContract(d.contractKey)}>
                  {d.numero} (UASG {d.uasg})
                </AppButton>
                : {d.avisos.join(' ')}
              </li>
            ))}
            {divergentesPncp.length > FALHAS_VISIVEIS && <li>e mais {divergentesPncp.length - FALHAS_VISIVEIS} contrato(s).</li>}
          </ul>
        </div>
      )}
    </div>
  );
};
