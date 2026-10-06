import React from 'react';
import { AlertCard, ActionButton, NoticeBar, StatusBadge, SummaryBar } from '../../design-system';
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

  const percent = s.homologado > 0 ? (s.contratado / s.homologado) * 100 : 0;

  return (
    <SummaryBar
      testId="item-execution-summary"
      loading={loading}
      loadingLabel="Carregando contratos e empenhos..."
      items={[
        { label: 'Contratado', value: `${formatNumber(s.contratado)} de ${formatNumber(s.homologado)} (${formatNumber(percent)}%)` },
        { label: 'Empenhado', value: formatNumber(s.empenhado) },
        { label: 'A empenhar', value: formatNumber(s.aEmpenhar), tone: s.aEmpenhar < 0 ? 'danger' : 'default' }
      ]}
      progress={{ value: s.contratado, max: s.homologado }}
      extra={
        s.contratosSemQuantidade > 0 ? (
          <StatusBadge
            label={`${s.contratosSemQuantidade} ${s.contratosSemQuantidade === 1 ? 'contrato' : 'contratos'} sem quantidade lida da API`}
            variant="warning"
            size="sm"
            dot={false}
          />
        ) : null
      }
    >
      {s.pendentes > 0 && (
        <NoticeBar
          testId="empenhos-pendentes-banner"
          action={
            canEdit && aceitaveis > 0 && onAcceptAll ? (
              <ActionButton action="aplicarSugestao" size="sm" onClick={onAcceptAll} disabled={busy}>
                Aceitar todas as sugestões do item
              </ActionButton>
            ) : undefined
          }
        >
          <strong>{s.pendentes}</strong> {s.pendentes === 1 ? 'empenho pendente de confirmação' : 'empenhos pendentes de confirmação'}
          {s.pendentesSugerido > 0 && <> ({formatNumber(s.pendentesSugerido)} un sugeridas pelo valor)</>}. Não entram no empenhado até serem confirmados.
        </NoticeBar>
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
    </SummaryBar>
  );
};
