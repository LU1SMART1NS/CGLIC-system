import React, { useState, useMemo, useEffect } from 'react';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { SeverityBadge } from '../../design-system/components/SeverityBadge';
import { EmptyState } from '../../design-system/components/EmptyState';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import {
  getInstrumentoInfo,
  getMotivoInfo,
  getSituacaoAtual,
  getPrazoLabel,
  getAcaoInfo,
  getLookupKey,
  type AttentionItemWithUasg
} from './gestaoInstrumentosRowHelpers';

interface GestaoInstrumentosTableProps {
  items: AttentionItemWithUasg[];
  totalItems: number;
  fornecedorByKey: Map<string, string>;
  responsavelByContractKey: Map<string, string>;
  onResetFilters: () => void;
  pageSize?: number;
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.65rem 0.85rem',
  fontSize: '0.75rem',
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
  const navigate = useNavigateWithOrigin();
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
            background: 'var(--primary)',
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
        <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Prioridade</th>
              <th style={th}>UASG</th>
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
              const lookupKey = getLookupKey(item);
              const fornecedor = fornecedorByKey.get(lookupKey);
              const responsavel = item.contractKey ? responsavelByContractKey.get(item.contractKey) : undefined;

              return (
                <tr key={item.id} data-testid={`instrumentos-row-${item.id}`}>
                  <td data-role="id" style={td}>
                    <SeverityBadge severity={item.severity} />
                  </td>
                  <td data-label="UASG" style={{ ...td, fontWeight: 700, color: '#475569' }} data-testid={`instrumentos-uasg-${item.id}`}>
                    {item.uasg}
                  </td>
                  <td data-role="id" style={td}>
                    <div style={{ fontWeight: 800 }}>{instrumento.label}</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                      {instrumento.tipo}
                    </div>
                  </td>
                  <td data-role="id" style={{ ...td, maxWidth: '220px' }}>
                    {item.objetoItem ? (
                      <>
                        <div title={item.objetoItem} style={{ fontWeight: 600, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.objetoItem}</div>
                        {item.fornecedorNome && (
                          <div title={item.fornecedorNome} style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.fornecedorNome}</div>
                        )}
                      </>
                    ) : fornecedor ? (
                      <span title={fornecedor}>{fornecedor}</span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                  <td data-label="Situação" style={td}>{situacao}</td>
                  <td data-label="Motivo" style={td}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      fontSize: '0.75rem',
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
                  <td data-label="Prazo" style={td}>{prazo}</td>
                  <td data-label="Responsável" style={td}>
                    {responsavel || <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                  <td data-role="action" style={td}>
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
                        color: 'var(--primary)',
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

      <CarteiraPagination
        page={currentPage}
        pageSize={pageSize}
        total={items.length}
        onChange={setPage}
        testIdPrefix="instrumentos"
      />
    </div>
  );
};
