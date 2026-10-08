import React, { useState, useMemo, useEffect } from 'react';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { ChevronRight } from 'lucide-react';
import { SeverityBadge } from '../../design-system/components/SeverityBadge';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { EmptyState } from '../../design-system/components/EmptyState';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { CarteiraSortHeader } from '../carteira/CarteiraSortHeader';
import { carteiraFornecedor, carteiraTh as th, carteiraTd as td } from '../carteira/carteiraStyles';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import {
  getInstrumentoInfo,
  getMotivoInfo,
  getSituacaoAtual,
  getPrazoLabel,
  getAcaoInfo,
  getLookupKey,
  getAlvoResolucao,
  type AttentionItemWithUasg
} from './gestaoInstrumentosRowHelpers';
import { BotaoResolvido, EspacoResolvido, type AlvoResolucao } from '../avisos/ResolverAviso';

interface GestaoInstrumentosTableProps {
  items: AttentionItemWithUasg[];
  totalItems: number;
  fornecedorByKey: Map<string, string>;
  responsavelByContractKey: Map<string, string>;
  onResetFilters: () => void;
  pageSize?: number;
  /** ✓ Resolvido: abre a justificativa. Sem esta prop (ou sem permissão) a coluna mostra só o botão de ir. */
  onResolver?: (alvo: AlvoResolucao) => void;
  podeResolverAlvo?: (alvo: AlvoResolucao) => boolean;
}

const SEVERIDADE_ORDEM: Record<string, number> = { CRITICA: 0, URGENTE: 1, ATENCAO: 2, INFO: 3 };

const SORT_COLUMNS: Record<string, CarteiraSortColumn<RowData>> = {
  prioridade: { value: (r) => SEVERIDADE_ORDEM[r.item.severity] ?? 9 },
  uasg: { value: (r) => r.item.uasg },
  instrumento: { value: (r) => `${r.instrumento.tipo} ${r.instrumento.label}` },
  objeto: { value: (r) => r.item.objetoItem || r.fornecedor || r.item.fornecedorNome },
  situacao: { value: (r) => r.situacao },
  motivo: { value: (r) => r.motivo.label },
  prazo: { value: (r) => r.item.diasRelevantes ?? null },
  responsavel: { value: (r) => r.responsavel }
};

interface RowData {
  item: AttentionItemWithUasg;
  instrumento: ReturnType<typeof getInstrumentoInfo>;
  motivo: ReturnType<typeof getMotivoInfo>;
  situacao: string;
  fornecedor?: string;
  responsavel?: string;
}

export const GestaoInstrumentosTable: React.FC<GestaoInstrumentosTableProps> = ({
  items,
  totalItems,
  fornecedorByKey,
  responsavelByContractKey,
  onResetFilters,
  pageSize = 10,
  onResolver,
  podeResolverAlvo
}) => {
  const navigate = useNavigateWithOrigin();
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [items]);

  const rows = useMemo<RowData[]>(
    () =>
      items.map((item) => {
        const fornecedor = fornecedorByKey.get(getLookupKey(item));
        return {
          item,
          instrumento: getInstrumentoInfo(item),
          motivo: getMotivoInfo(item.category),
          situacao: getSituacaoAtual(item),
          fornecedor,
          responsavel: item.contractKey ? responsavelByContractKey.get(item.contractKey) : undefined
        };
      }),
    [items, fornecedorByKey, responsavelByContractKey]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(rows, SORT_COLUMNS);
  const sort = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);


  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
        <ActionButton action="limparFiltros"
          type="button"
          size="sm"
          onClick={onResetFilters}
          style={{ marginTop: '0.5rem' }} />
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
              <CarteiraSortHeader label="Prioridade" sortKey="prioridade" {...sort} />
              <CarteiraSortHeader label="UASG" sortKey="uasg" {...sort} />
              <CarteiraSortHeader label="Instrumento" sortKey="instrumento" {...sort} />
              <CarteiraSortHeader label="Objeto / Fornecedor" sortKey="objeto" {...sort} />
              <CarteiraSortHeader label="Situação Atual" sortKey="situacao" {...sort} />
              <CarteiraSortHeader label="Motivo da Atenção" sortKey="motivo" {...sort} />
              <CarteiraSortHeader label="Prazo" sortKey="prazo" {...sort} />
              <CarteiraSortHeader label="Responsável" sortKey="responsavel" {...sort} />
              <th style={th}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(({ item, instrumento, motivo, situacao, fornecedor, responsavel }) => {
              const prazo = getPrazoLabel(item);
              const acao = getAcaoInfo(item);

              return (
                <tr key={item.id} data-testid={`instrumentos-row-${item.id}`}>
                  <td data-role="id" style={td}>
                    <SeverityBadge severity={item.severity} iconOnly />
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
                          <div title={item.fornecedorNome} style={carteiraFornecedor}>{item.fornecedorNome}</div>
                        )}
                      </>
                    ) : fornecedor ? (
                      <span title={fornecedor} style={{ textTransform: 'uppercase' }}>{fornecedor}</span>
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', flexWrap: 'nowrap' }}>
                      <AppButton
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(acao.targetUrl)}
                        data-testid={`instrumentos-action-${item.id}`}
                        title={item.category === 'PAGAMENTO_CRITICO' || item.category === 'PAGAMENTO_PREVISTO' ? 'O aviso some sozinho quando a etapa do pagamento é registrada' : undefined}
                      >
                        {acao.label}
                        <ChevronRight size={13} />
                      </AppButton>
                      {(() => {
                        const alvo = onResolver ? getAlvoResolucao(item) : null;
                        return alvo && (podeResolverAlvo?.(alvo) ?? true)
                          ? <BotaoResolvido onClick={() => onResolver!(alvo)} testId={`instrumentos-resolver-${item.id}`} />
                          : <EspacoResolvido />;
                      })()}
                    </div>
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
