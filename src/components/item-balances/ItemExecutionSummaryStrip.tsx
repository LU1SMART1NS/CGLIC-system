import React from 'react';
import { AlertCard, AppButton, NoticeBar, StatusBadge, SummaryBar } from '../../design-system';
import { formatCurrency, formatNumber } from './itemBalanceUtils';
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
  /** Abre a fila Vinculação › Empenhos aos itens (gestor e coordenador); sem ela, o aviso não tem botão. */
  onVincularAosItens?: () => void;
}

/**
 * Resumo do item em uma linha: o consumo da ata é o contratado (quantidade lida da API nos contratos vinculados)
 * e o empenho é a execução desse contratado. Saldo da ata e homologado ficam no topo do item.
 * O Compras.gov aparece só como aviso, e só quando registra mais consumo do que os contratos cobrem.
 * O empenhado é a soma das parcelas deste item nas notas vinculadas aos itens do contrato.
 */
export const ItemExecutionSummaryStrip: React.FC<ItemExecutionSummaryStripProps> = ({
  summary,
  referencia,
  loading = false,
  onVincularAosItens
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
      {s.notasAVincular > 0 && (
        <NoticeBar
          testId="item-notas-a-vincular"
          action={
            onVincularAosItens ? (
              <AppButton variant="outline" size="sm" onClick={onVincularAosItens}>
                Vincular aos itens
              </AppButton>
            ) : undefined
          }
        >
          <strong>{s.notasAVincular}</strong>{' '}
          {s.notasAVincular === 1 ? 'nota dos contratos deste item ainda não foi vinculada' : 'notas dos contratos deste item ainda não foram vinculadas'} aos
          itens e {s.notasAVincular === 1 ? 'pode conter' : 'podem conter'} este item ({formatCurrency(s.valorAVincular)}). Não entram no empenhado do item até serem
          vinculadas.
        </NoticeBar>
      )}

      {s.contratosSemItens > 0 && (
        <NoticeBar tone="info" testId="item-contratos-sem-itens">
          {s.contratosSemItens === 1 ? 'Um contrato deste item não tem' : `${s.contratosSemItens} contratos deste item não têm`} itens na fonte oficial: as
          notas ({formatCurrency(s.valorSemDivisao)}) ficam no contrato inteiro, sem divisão por item, e não contam no empenhado do item.
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
