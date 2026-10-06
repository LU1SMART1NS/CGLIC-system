import React, { useState } from 'react';
import { ActionButton, DataTable, StatusBadge, type Column } from '../../design-system';
import { formatCurrency } from '../../utils/format';
import { formatNumber } from './itemBalanceUtils';
import { summarizeContractExecution } from '../../utils/itemExecutionSummary';
import { estadoDoVinculo, type ItemEmpenhoVinculo } from '../../types/itemEmpenhoVinculo';

export interface AllocationOption {
  id: string;
  unitName: string;
  saldoQty: number;
}

interface ContractEmpenhosPanelProps {
  contractKey: string;
  /** Quantidade do item no contrato segundo a API; nula enquanto não lida. */
  contratado: number | null;
  /** Empenhos do item (de todos os contratos); o painel filtra os do contrato. */
  vinculos: ItemEmpenhoVinculo[];
  loading: boolean;
  /** Gestor ou admin: pode confirmar quantidade. */
  canEdit: boolean;
  canLinkEmpenhos: boolean;
  allocationOptions: AllocationOption[];
  /** Id da unidade interna a que o empenho (pelo número) está vinculado. */
  linkedAllocationId: (numeroEmpenho: string) => string;
  /** Confirma a quantidade de um empenho; nulo devolve-o a pendente. */
  onConfirm: (vinculo: ItemEmpenhoVinculo, quantidade: number | null) => void;
  onConfirmAll: (vinculos: ItemEmpenhoVinculo[]) => void;
  onLinkAllocation: (numeroEmpenho: string, allocationId: string) => void;
  busy: boolean;
}

const ESTADO_LABEL = { OFICIAL: 'Oficial', INFORMADA: 'Confirmada', PENDENTE: 'Pendente' } as const;
const ESTADO_VARIANT = { OFICIAL: 'success', INFORMADA: 'info', PENDENTE: 'warning' } as const;

const sameKey = (a?: string | null, b?: string | null) => (a || '').trim().toUpperCase() === (b || '').trim().toUpperCase();

/** Linha de confirmação de quantidade de um empenho pendente. */
const PendingConfirm: React.FC<{
  vinculo: ItemEmpenhoVinculo;
  busy: boolean;
  onConfirm: (v: ItemEmpenhoVinculo, q: number | null) => void;
}> = ({ vinculo, busy, onConfirm }) => {
  const [value, setValue] = useState('');
  const sugerida = vinculo.quantidadeSugerida;
  const parsed = value.trim() === '' ? sugerida : parseFloat(value.replace(',', '.'));
  const invalid = parsed == null || Number.isNaN(parsed) || parsed <= 0;

  return (
    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', justifyContent: 'flex-end' }}>
      <input
        type="number"
        step="any"
        min="0"
        value={value}
        placeholder={sugerida != null ? String(sugerida) : 'Qtd'}
        aria-label={`Quantidade do empenho ${vinculo.empenho.numero}`}
        onChange={(e) => setValue(e.target.value)}
        style={{ width: '72px', padding: '0.25rem 0.4rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
      />
      <ActionButton
        action="confirmar"
        size="sm"
        onClick={() => parsed != null && !invalid && onConfirm(vinculo, parsed)}
        disabled={busy || invalid}
        title={sugerida != null && value.trim() === '' ? 'Aceitar a quantidade sugerida pelo valor do empenho' : 'Confirmar esta quantidade'}
      >
        {sugerida != null && value.trim() === '' ? 'Aceitar' : 'Confirmar'}
      </ActionButton>
    </div>
  );
};

export const ContractEmpenhosPanel: React.FC<ContractEmpenhosPanelProps> = ({
  contractKey,
  contratado,
  vinculos,
  loading,
  canEdit,
  canLinkEmpenhos,
  allocationOptions,
  linkedAllocationId,
  onConfirm,
  onConfirmAll,
  onLinkAllocation,
  busy
}) => {
  const rows = vinculos.filter((v) => sameKey(v.contractKey, contractKey));
  const exec = summarizeContractExecution(contractKey, contratado, vinculos);
  const aceitaveis = rows.filter((v) => v.quantidade == null && v.quantidadeSugerida != null && v.quantidadeSugerida > 0);

  const columns: Column<ItemEmpenhoVinculo>[] = [
    {
      key: 'empenho',
      header: 'Empenho',
      sortValue: (v) => v.empenho.numero,
      render: (v) => (
        <>
          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--primary)' }}>{v.empenho.numero}</span>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            UASG {v.empenho.uasg}{v.empenho.dataEmissao ? ` • ${v.empenho.dataEmissao.split('-').reverse().join('/')}` : ''}
          </div>
        </>
      )
    },
    {
      key: 'valor',
      header: 'Valor',
      sortValue: (v) => v.empenho.valorEmpenhado,
      sortFirstDir: 'desc',
      align: 'right',
      render: (v) => formatCurrency(v.empenho.valorEmpenhado)
    },
    {
      key: 'qtd',
      header: 'Qtd',
      sortValue: (v) => v.quantidade ?? v.quantidadeSugerida,
      sortFirstDir: 'desc',
      align: 'right',
      render: (v) =>
        v.quantidade != null ? (
          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{formatNumber(v.quantidade)}</span>
        ) : v.quantidadeSugerida != null ? (
          <span style={{ fontFamily: 'monospace', color: 'var(--warning)' }} title="Sugestão pelo valor do empenho; ainda não confirmada">
            {formatNumber(v.quantidadeSugerida)} sug.
          </span>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>N/D</span>
        )
    },
    {
      key: 'estado',
      header: 'Estado',
      sortValue: (v) => ESTADO_LABEL[estadoDoVinculo(v)],
      render: (v) => {
        const estado = estadoDoVinculo(v);
        return <StatusBadge label={ESTADO_LABEL[estado]} variant={ESTADO_VARIANT[estado]} size="sm" dot={false} />;
      }
    },
    {
      key: 'unidade',
      header: 'Unidade interna',
      render: (v) => {
        if (allocationOptions.length === 0) {
          return <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Sem unidades cadastradas</span>;
        }
        const current = linkedAllocationId(v.empenho.numero);
        return (
          <select
            value={current}
            onChange={(e) => onLinkAllocation(v.empenho.numero, e.target.value)}
            disabled={busy || !canLinkEmpenhos}
            className="form-input"
            aria-label={`Unidade interna do empenho ${v.empenho.numero}`}
            style={{
              padding: '0.2rem 0.4rem',
              fontSize: '0.75rem',
              height: 'auto',
              width: '100%',
              maxWidth: '200px',
              borderColor: current ? 'var(--primary)' : '#cbd5e1',
              background: current ? 'var(--color-info-bg)' : '#ffffff'
            }}
          >
            <option value="">Não vinculado</option>
            {allocationOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.unitName} (Saldo: {formatNumber(a.saldoQty)} un)
              </option>
            ))}
          </select>
        );
      }
    },
    {
      key: 'acao',
      header: 'Ação',
      align: 'right',
      render: (v) => {
        if (!canEdit) return null;
        if (v.quantidade == null) return <PendingConfirm vinculo={v} busy={busy} onConfirm={onConfirm} />;
        if (v.fonte === 'USUARIO') {
          return (
            <ActionButton action="desfazer" size="sm" onClick={() => onConfirm(v, null)} disabled={busy} title="Voltar a pendente">
              Desfazer
            </ActionButton>
          );
        }
        return null;
      }
    }
  ];

  return (
    <div data-testid="contract-empenhos-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
          <span>Contratado: <strong>{contratado != null ? formatNumber(contratado) : 'N/D'}</strong></span>
          <span>Empenhado: <strong>{formatNumber(exec.empenhado)}</strong></span>
          <span>
            A empenhar: <strong style={{ color: exec.aEmpenhar != null && exec.aEmpenhar < 0 ? 'var(--danger)' : undefined }}>
              {exec.aEmpenhar != null ? formatNumber(exec.aEmpenhar) : 'N/D'}
            </strong>
          </span>
          {exec.pendentes > 0 && (
            <StatusBadge
              label={`${exec.pendentes} ${exec.pendentes === 1 ? 'pendente' : 'pendentes'}${exec.pendentesSugerido > 0 ? ` (${formatNumber(exec.pendentesSugerido)} un sugeridas)` : ''}`}
              variant="warning"
              size="sm"
              dot={false}
            />
          )}
        </div>
        {canEdit && aceitaveis.length > 0 && (
          <ActionButton action="aplicarSugestao"
            size="sm"
            onClick={() => onConfirmAll(aceitaveis)}
            disabled={busy}
            title="Confirma a quantidade sugerida de todos os empenhos pendentes deste contrato"
          >
            Aceitar todas as sugestões ({formatNumber(aceitaveis.reduce((s, v) => s + (v.quantidadeSugerida ?? 0), 0))} un)
          </ActionButton>
        )}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        keyExtractor={(v) => v.id}
        isLoading={loading}
        emptyMessage="Nenhum empenho lido deste contrato para este item. Os empenhos são lidos da API ao vincular o contrato e ao abrir o item."
        testId="contract-empenhos-table"
      />
    </div>
  );
};
