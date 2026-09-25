import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { SeverityBadge } from '../../design-system/components/SeverityBadge';
import { EmptyState } from '../../design-system/components/EmptyState';
import type { DashboardAttentionItem } from '../../types/managementDashboard';
import {
  getInstrumentoInfo,
  getMotivoInfo,
  getSituacaoAtual,
  getPrazoLabel,
  getAcaoInfo
} from './gestaoInstrumentosRowHelpers';

interface GestaoInstrumentosTableProps {
  items: DashboardAttentionItem[];
  totalItems: number;
  fornecedorByKey: Map<string, string>;
  responsavelByContractKey: Map<string, string>;
  onResetFilters: () => void;
  pageSize?: number;
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.65rem 0.85rem',
  fontSize: '0.7rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  color: '#64748b',
  borderBottom: '1px solid #e2e8f0',
  whiteSpace: 'nowrap'
};

const td: React.CSSProperties = {
  padding: '0.7rem 0.85rem',
  fontSize: '0.82rem',
  color: '#0f172a',
  borderBottom: '1px solid #f1f5f9',
  verticalAlign: 'middle'
};

export const GestaoInstrumentosTable: React.FC<GestaoInstrumentosTableProps> = ({
  items,
  totalItems,
  fornecedorByKey,
  responsavelByContractKey,
  onResetFilters,
  pageSize = 10
}) => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  if (totalItems === 0) {
    return (
      <EmptyState
        title="Tudo em dia"
        description="Nenhum instrumento exige atenção no contexto selecionado."
      />
    );
  }

  if (items.length === 0) {
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem'
      }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
          Nenhum instrumento encontrado
        </h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', maxWidth: '400px' }}>
          Nenhum instrumento corresponde aos filtros selecionados. Altere os critérios ou limpe os filtros.
        </p>
        <button
          type="button"
          onClick={onResetFilters}
          style={{
            marginTop: '0.5rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.45rem 0.85rem',
            background: '#0c326f',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.78rem',
            fontWeight: 700,
            color: '#ffffff',
            cursor: 'pointer'
          }}
        >
          <RotateCcw size={13} /> Limpar Filtros
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="instrumentos-table"
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '10px',
        overflow: 'hidden'
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Prioridade</th>
              <th style={th}>Instrumento</th>
              <th style={th}>Objeto / Fornecedor</th>
              <th style={th}>Situação Atual</th>
              <th style={th}>Motivo da Atenção</th>
              <th style={th}>Prazo</th>
              <th style={th}>Responsável</th>
              <th style={th}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((item) => {
              const instrumento = getInstrumentoInfo(item);
              const motivo = getMotivoInfo(item.category);
              const situacao = getSituacaoAtual(item);
              const prazo = getPrazoLabel(item);
              const acao = getAcaoInfo(item);
              const fornecedorKey = item.contractKey || item.numeroAta || '';
              const fornecedor = fornecedorByKey.get(fornecedorKey);
              const responsavel = item.contractKey ? responsavelByContractKey.get(item.contractKey) : undefined;

              return (
                <tr key={item.id} data-testid={`instrumentos-row-${item.id}`}>
                  <td style={td}>
                    <SeverityBadge severity={item.severity} />
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 800 }}>{instrumento.label}</div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                      {instrumento.tipo}
                    </div>
                  </td>
                  <td style={{ ...td, maxWidth: '220px' }}>
                    {fornecedor ? (
                      <span title={fornecedor}>{fornecedor}</span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                  <td style={td}>{situacao}</td>
                  <td style={td}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      color: motivo.color,
                      background: motivo.bg,
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap'
                    }}>
                      {motivo.label}{motivo.referenciaLegal ? ` (${motivo.referenciaLegal})` : ''}
                    </span>
                  </td>
                  <td style={td}>{prazo}</td>
                  <td style={td}>
                    {responsavel || <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                  <td style={td}>
                    <button
                      type="button"
                      onClick={() => navigate(acao.targetUrl)}
                      data-testid={`instrumentos-action-${item.id}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.4rem 0.75rem',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        color: '#0c326f',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {acao.label}
                      <ChevronRight size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.65rem 0.85rem',
          borderTop: '1px solid #e2e8f0',
          fontSize: '0.78rem',
          color: '#64748b'
        }}>
          <span>
            Mostrando {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, items.length)} de {items.length}
          </span>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                data-testid={`instrumentos-page-${p}`}
                style={{
                  minWidth: '28px',
                  padding: '0.3rem 0.5rem',
                  borderRadius: '6px',
                  border: p === currentPage ? '1px solid #0c326f' : '1px solid #e2e8f0',
                  background: p === currentPage ? '#0c326f' : '#ffffff',
                  color: p === currentPage ? '#ffffff' : '#475569',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
