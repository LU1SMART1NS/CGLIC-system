import React, { useState } from 'react';
import { Sparkles, RotateCcw, X, Link2 } from 'lucide-react';
import { AppButton, StatusBadge } from '../../design-system';
import { formatCnpj } from '../../utils/format';
import { formatNumber } from './itemBalanceUtils';
import type { ItemContractSuggestion } from '../../utils/itemContractSuggestions';

interface ContractSuggestionsPanelProps {
  suggestions: ItemContractSuggestion[];
  dismissed: ItemContractSuggestion[];
  loading: boolean;
  error?: string | null;
  canEdit: boolean;
  busy: boolean;
  onLink: (s: ItemContractSuggestion) => void;
  onDismiss: (s: ItemContractSuggestion) => void;
  onRestore: (s: ItemContractSuggestion) => void;
}

/** "001602026" -> "00160/2026"; mantém o que já vier com barra ou fora do padrão. */
export const formatNumeroContrato = (num: string, ano?: string | number): string => {
  const raw = (num || '').trim();
  if (!raw || raw.includes('/') || /\D/.test(raw)) return raw;
  const anoStr = String(ano ?? '').replace(/\D/g, '');
  if (anoStr.length === 4 && raw.length > 4 && raw.endsWith(anoStr)) return `${raw.slice(0, -4)}/${anoStr}`;
  if (raw.length > 4 && /^20\d{2}$/.test(raw.slice(-4))) return `${raw.slice(0, -4)}/${raw.slice(-4)}`;
  return anoStr.length === 4 ? `${raw}/${anoStr}` : raw;
};

const displayNumero = (s: ItemContractSuggestion): string => {
  if (s.contract) return s.contract.numeroFormatado || formatNumeroContrato(s.contract.numero, s.contract.ano);
  const num = s.pncp?.numeroContrato || '';
  return num ? formatNumeroContrato(num, s.pncp?.anoContrato) : s.contractKey;
};

const fornecedorOf = (s: ItemContractSuggestion) => ({
  nome: s.contract?.fornecedorNome || s.pncp?.nomeRazaoSocialFornecedor || 'Fornecedor não informado',
  cnpj: s.contract?.fornecedorCnpjCpf || s.pncp?.niFornecedor || ''
});

const SOURCE_LABEL = { pncp: 'PNCP', catalogo: 'Mesma compra e fornecedor' } as const;

export const ContractSuggestionsPanel: React.FC<ContractSuggestionsPanelProps> = ({
  suggestions,
  dismissed,
  loading,
  error,
  canEdit,
  busy,
  onLink,
  onDismiss,
  onRestore
}) => {
  const [showDismissed, setShowDismissed] = useState(false);

  const renderRow = (s: ItemContractSuggestion, isDismissed: boolean) => {
    const f = fornecedorOf(s);
    return (
      <tr key={s.contractKey} data-testid="contract-suggestion-row">
        <td style={{ fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap', color: '#0c326f' }}>{displayNumero(s)}</td>
        <td style={{ fontSize: '0.85rem' }}>
          {s.contract?.uasg || s.pncp?.uasg || s.contractKey.split('-')[0] || '-'}
        </td>
        <td style={{ fontSize: '0.82rem' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{f.nome}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>CNPJ: {f.cnpj ? formatCnpj(f.cnpj) : '-'}</div>
        </td>
        <td style={{ fontFamily: 'monospace', fontSize: '0.88rem', fontWeight: 700 }}>
          {s.quantidadeContratada != null ? formatNumber(s.quantidadeContratada) : <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>N/D</span>}
        </td>
        <td>
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
            {s.sources.map((src) => (
              <StatusBadge key={src} label={SOURCE_LABEL[src]} variant="info" size="sm" dot={false} />
            ))}
          </div>
        </td>
        <td style={{ textAlign: 'center' }}>
          {canEdit && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem' }}>
              {isDismissed ? (
                <AppButton variant="outline" size="sm" icon={<RotateCcw size={13} />} onClick={() => onRestore(s)} disabled={busy} title="Voltar a sugerir este contrato">
                  Restaurar
                </AppButton>
              ) : (
                <>
                  <AppButton variant="primary" size="sm" icon={<Link2 size={13} />} onClick={() => onLink(s)} disabled={busy} title="Vincular este contrato ao item">
                    Vincular
                  </AppButton>
                  <AppButton variant="outline" size="sm" icon={<X size={13} />} onClick={() => onDismiss(s)} disabled={busy} title="Este contrato não pertence a este item">
                    Descartar
                  </AppButton>
                </>
              )}
            </div>
          )}
        </td>
      </tr>
    );
  };

  const renderTable = (list: ItemContractSuggestion[], isDismissed: boolean) => (
    <div className="table-container" style={{ marginTop: 0, overflowX: 'auto', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
      <table className="custom-table" style={{ margin: 0 }}>
        <thead>
          <tr>
            <th>Número do contrato</th>
            <th>UASG</th>
            <th>Fornecedor</th>
            <th>Quantidade</th>
            <th>Origem</th>
            <th style={{ textAlign: 'center' }}>Ação</th>
          </tr>
        </thead>
        <tbody>{list.map((s) => renderRow(s, isDismissed))}</tbody>
      </table>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }} data-testid="contract-suggestions-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fffbeb', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #fde68a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, fontSize: '0.88rem', color: '#b45309' }}>
          <Sparkles size={16} /> Contratos sugeridos
        </div>
        <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>
          {suggestions.length} {suggestions.length === 1 ? 'sugestão' : 'sugestões'}
        </span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', justifyContent: 'center' }}>
          <div className="spinner" style={{ width: '20px', height: '20px' }}></div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Buscando contratos no PNCP...</span>
        </div>
      ) : error ? (
        <div style={{ padding: '0.75rem', color: 'var(--danger)', fontSize: '0.85rem', textAlign: 'center' }}>{error}</div>
      ) : suggestions.length === 0 ? (
        <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', background: '#ffffff', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
          Nenhum contrato sugerido para este item.
        </div>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748b' }}>
            Estes contratos ainda não foram vinculados ao item. Confirme antes de vincular ou descarte os que não pertencem a ele.
          </p>
          {renderTable(suggestions, false)}
        </>
      )}

      {dismissed.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowDismissed((v) => !v)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: 'var(--primary)' }}
          >
            {showDismissed ? 'Ocultar descartados' : `Ver descartados (${dismissed.length})`}
          </button>
          {showDismissed && <div style={{ marginTop: '0.5rem' }}>{renderTable(dismissed, true)}</div>}
        </div>
      )}
    </div>
  );
};
