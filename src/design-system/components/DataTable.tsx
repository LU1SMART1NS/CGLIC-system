import React from 'react';
import { colors, shapes, spacing, breakpoints } from '../tokens';
import { useMediaQuery } from '../hooks/useMediaQuery';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
  minWidth?: string;
  nowrap?: boolean;
  /**
   * Papel da coluna no cartão mobile: `primary` vira o título, `secondary` vira
   * linha rótulo/valor e `tertiary` não aparece. Sem nenhuma `primary`, a primeira
   * coluna assume o papel. Padrão: `secondary`.
   */
  priority?: 'primary' | 'secondary' | 'tertiary';
  /** Esconde a coluna na tabela abaixo do breakpoint (sm = 480px, md = 768px). */
  hideBelow?: 'sm' | 'md';
  /** Rótulo no cartão mobile (padrão: header). */
  mobileLabel?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  emptyMessage?: string;
  isLoading?: boolean;
  testId?: string;
  className?: string;
  /** Abaixo de md: `cards` (padrão) troca a tabela por cartões; `scroll` mantém a tabela rolável. */
  mobileLayout?: 'cards' | 'scroll';
  /** No modo scroll, fixa a primeira coluna ao rolar na horizontal. */
  stickyFirstColumn?: boolean;
  /** Largura mínima da tabela no modo scroll (ex.: '720px'). */
  minTableWidth?: string;
  /** Substitui o cartão padrão em casos ricos. */
  renderMobileCard?: (item: T, index: number) => React.ReactNode;
  /** Ações da linha: coluna "Ações" na tabela e rodapé do cartão (alvos de 44px) no mobile. */
  rowActions?: (item: T, index: number) => React.ReactNode;
  /** Cabeçalho da coluna de ações (padrão: "Ações"). */
  rowActionsHeader?: string;
  /** Estilo extra por linha/cartão (ex.: opacidade de registros inativos). */
  rowStyle?: (item: T, index: number) => React.CSSProperties | undefined;
}

const hideClass = (col: { hideBelow?: 'sm' | 'md' }) =>
  col.hideBelow ? `ds-table__hide-${col.hideBelow}` : undefined;

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'Nenhum registro encontrado.',
  isLoading = false,
  testId = 'data-table',
  className = '',
  mobileLayout = 'cards',
  stickyFirstColumn = false,
  minTableWidth,
  renderMobileCard,
  rowActions,
  rowActionsHeader = 'Ações',
  rowStyle
}: DataTableProps<T>) {
  const isMobile = useMediaQuery(`(max-width: ${breakpoints.md - 1}px)`);

  if (isLoading) {
    return (
      <div data-testid={`${testId}-loading`} className="animate-pulse" style={{ padding: spacing.xl, textAlign: 'center' }}>
        <div style={{ height: '40px', background: colors.background.subtle, borderRadius: shapes.radius.md, marginBottom: spacing.sm }} />
        <div style={{ height: '120px', background: colors.background.base, borderRadius: shapes.radius.md }} />
      </div>
    );
  }

  const cell = (col: Column<T>, item: T, idx: number): React.ReactNode =>
    col.render ? col.render(item, idx) : (item as Record<string, React.ReactNode>)[col.key];

  if (isMobile && mobileLayout === 'cards') {
    const hasPrimary = columns.some((c) => c.priority === 'primary');
    const roleOf = (c: Column<T>, i: number) =>
      c.priority ?? (!hasPrimary && i === 0 ? 'primary' : 'secondary');
    const primary = columns.filter((c, i) => roleOf(c, i) === 'primary');
    const secondary = columns.filter((c, i) => roleOf(c, i) === 'secondary');

    return (
      <div data-testid={testId} className={`data-table-container ds-table-cards ${className}`.trim()}>
        {data.length === 0 ? (
          <p className="ds-table-cards__empty" style={{ color: colors.text.muted }}>{emptyMessage}</p>
        ) : (
          <ul className="ds-table-cards__list">
            {data.map((item, idx) => {
              const key = keyExtractor(item, idx);
              return (
                <li
                  key={key}
                  data-testid={`${testId}-row-${key}`}
                  className="ds-table-cards__item"
                  style={rowStyle?.(item, idx)}
                >
                  {renderMobileCard ? (
                    renderMobileCard(item, idx)
                  ) : (
                    <>
                      {primary.length > 0 && (
                        <div className="ds-table-cards__title">
                          {primary.map((c) => (
                            <div key={c.key}>{cell(c, item, idx)}</div>
                          ))}
                        </div>
                      )}
                      {secondary.length > 0 && (
                        <dl className="ds-table-cards__fields">
                          {secondary.map((c) => (
                            <div key={c.key} className="ds-table-cards__field">
                              <dt>{c.mobileLabel ?? c.header}</dt>
                              <dd>{cell(c, item, idx)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </>
                  )}
                  {rowActions && <div className="ds-table-cards__actions">{rowActions(item, idx)}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  const colSpan = columns.length + (rowActions ? 1 : 0);

  return (
    <div
      data-testid={testId}
      className={`data-table-container table-scroll ${className}`.trim()}
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        background: '#ffffff',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
      }}
    >
      <table
        className={`ds-table${stickyFirstColumn ? ' ds-table--sticky-first' : ''}`}
        style={{ minWidth: minTableWidth }}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={hideClass(col)}
                style={{ textAlign: col.align || 'left', width: col.width, minWidth: col.minWidth, whiteSpace: col.nowrap ? 'nowrap' : undefined }}
              >
                {col.header}
              </th>
            ))}
            {rowActions && <th style={{ textAlign: 'right' }}>{rowActionsHeader}</th>}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="ds-table__empty" style={{ color: colors.text.muted }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item, idx) => (
              <tr
                key={keyExtractor(item, idx)}
                data-testid={`${testId}-row-${keyExtractor(item, idx)}`}
                style={rowStyle?.(item, idx)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={hideClass(col)}
                    style={{ textAlign: col.align || 'left', minWidth: col.minWidth, whiteSpace: col.nowrap ? 'nowrap' : undefined }}
                  >
                    {cell(col, item, idx)}
                  </td>
                ))}
                {rowActions && <td style={{ textAlign: 'right' }}>{rowActions(item, idx)}</td>}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
