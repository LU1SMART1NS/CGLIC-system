import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { ActionButton, AppButton, StatusBadge, SectionHeader, DataTable, type Column } from '../../design-system';
import { formatCnpj } from '../../utils/format';
import { formatNumber } from './itemBalanceUtils';
import { formatNumeroContrato, displayContractNumber } from '../../utils/contractNumber';
import { CarteiraIdLink } from '../carteira/CarteiraRowLink';
import { formatPncpContractUrl } from '../../utils/pncpUtils';
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

const displayNumero = (s: ItemContractSuggestion): string => {
  if (s.contract) return displayContractNumber(s.contract);
  const num = s.pncp?.numeroContrato || '';
  return num ? formatNumeroContrato(num, s.pncp?.anoContrato) : s.contractKey;
};

const fornecedorOf = (s: ItemContractSuggestion) => ({
  nome: s.contract?.fornecedorNome || s.pncp?.nomeRazaoSocialFornecedor || 'Fornecedor não informado',
  cnpj: s.contract?.fornecedorCnpjCpf || s.pncp?.niFornecedor || ''
});

const pncpUrlOf = (s: ItemContractSuggestion): string =>
  formatPncpContractUrl(
    s.pncp?.numeroControlePncp || s.contract?.numeroControlePncp,
    s.pncp?.linkVisualizacao || s.contract?.linkPncp
  );

const abrirNoPncp = (url: string) => () => window.open(url, '_blank', 'noopener,noreferrer');

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
  const vazio = !loading && !error && suggestions.length === 0;

  const buildColumns = (isDismissed: boolean): Column<ItemContractSuggestion>[] => [
    {
      key: 'numero',
      header: 'Número do contrato',
      sortValue: (s) => displayNumero(s),
      render: (s) => {
        const url = pncpUrlOf(s);
        return url ? (
          <CarteiraIdLink onClick={abrirNoPncp(url)} label={`Abrir o contrato ${displayNumero(s)} no PNCP`} title="Abrir o contrato no PNCP">
            {displayNumero(s)}
          </CarteiraIdLink>
        ) : (
          <span style={{ fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--primary)' }}>{displayNumero(s)}</span>
        );
      }
    },
    {
      key: 'unidade',
      header: 'Unidade',
      sortValue: (s) => (s.linkable ? (s.contract?.uasg || s.pncp?.uasg || s.contractKey.split('-')[0]) : null),
      render: (s) => (s.linkable ? (s.contract?.uasg || s.pncp?.uasg || s.contractKey.split('-')[0] || '-') : '-')
    },
    {
      key: 'fornecedor',
      header: 'Fornecedor',
      sortValue: (s) => fornecedorOf(s).nome,
      render: (s) => {
        const f = fornecedorOf(s);
        return (
          <>
            <div style={{ fontWeight: 600 }}>{f.nome}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>CNPJ: {f.cnpj ? formatCnpj(f.cnpj) : '-'}</div>
          </>
        );
      }
    },
    {
      key: 'quantidade',
      header: 'Qtd. contratada',
      sortValue: (s) => s.quantidadeContratada,
      sortFirstDir: 'desc',
      render: (s) =>
        s.quantidadeContratada != null ? (
          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{formatNumber(s.quantidadeContratada)}</span>
        ) : (
          <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>N/D</span>
        )
    },
    {
      key: 'origem',
      header: 'Origem',
      render: (s) => (
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {s.sources.map((src) => (
            <StatusBadge key={src} label={SOURCE_LABEL[src]} variant="info" size="sm" dot={false} />
          ))}
          {!s.linkable && <StatusBadge label="UASG não identificada na API" variant="warning" size="sm" dot={false} />}
        </div>
      )
    },
    {
      key: 'acao',
      header: 'Ação',
      align: 'center',
      render: (s) =>
        canEdit ? (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem' }}>
            {isDismissed ? (
              <ActionButton action="restaurar" size="sm" onClick={() => onRestore(s)} disabled={busy} title="Voltar a sugerir este contrato" />
            ) : (
              <>
                {s.linkable && (
                  <ActionButton action="vincular" size="sm" onClick={() => onLink(s)} disabled={busy} title="Vincular este contrato ao item" />
                )}
                <ActionButton action="descartar" size="sm" onClick={() => onDismiss(s)} disabled={busy} title="Este contrato não pertence a este item" />
              </>
            )}
          </div>
        ) : null
    }
  ];

  const renderTable = (list: ItemContractSuggestion[], isDismissed: boolean) => (
    <DataTable
      columns={buildColumns(isDismissed)}
      data={list}
      keyExtractor={(s) => s.contractKey}
      rowOpen={(s) => {
        const url = pncpUrlOf(s);
        return url ? abrirNoPncp(url) : null;
      }}
      testId={isDismissed ? 'contract-dismissed-table' : 'contract-suggestions-table'}
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="contract-suggestions-panel">
      {vazio ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          <Sparkles size={16} aria-hidden="true" />
          <span>Sugeridos (0): nenhum contrato sugerido para este item.</span>
        </div>
      ) : (
      <SectionHeader
        title="Sugeridos"
        subtitle="Encontrados nas APIs oficiais e ainda não vinculados a este item. Confirme antes de vincular ou descarte os que não pertencem a ele."
        icon={<Sparkles size={16} />}
        countBadge={suggestions.length}
      />
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', justifyContent: 'center' }}>
          <div className="spinner" style={{ width: '20px', height: '20px' }}></div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Buscando contratos no PNCP...</span>
        </div>
      ) : error ? (
        <div style={{ padding: '0.75rem', color: 'var(--danger)', fontSize: '0.85rem', textAlign: 'center' }}>{error}</div>
      ) : vazio ? null : (
        renderTable(suggestions, false)
      )}

      {dismissed.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <AppButton type="button" variant="link" size="sm" onClick={() => setShowDismissed((v) => !v)}>
            {showDismissed ? 'Ocultar descartados' : `Ver descartados (${dismissed.length})`}
          </AppButton>
          {showDismissed && <div style={{ marginTop: '0.5rem' }}>{renderTable(dismissed, true)}</div>}
        </div>
      )}
    </div>
  );
};
