import React from 'react';
import { colors, shapes, spacing } from '../tokens';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  emptyMessage?: string;
  isLoading?: boolean;
  testId?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'Nenhum registro encontrado.',
  isLoading = false,
  testId = 'data-table',
  className = ''
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div data-testid={`${testId}-loading`} className="animate-pulse" style={{ padding: spacing.xl, textAlign: 'center' }}>
        <div style={{ height: '40px', background: colors.background.subtle, borderRadius: shapes.radius.md, marginBottom: spacing.sm }} />
        <div style={{ height: '120px', background: colors.background.base, borderRadius: shapes.radius.md }} />
      </div>
    );
  }

  return (
    <div
      data-testid={testId}
      className={`data-table-container ${className}`.trim()}
      style={{
        overflowX: 'auto',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        background: '#ffffff',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.82rem',
          textAlign: 'left'
        }}
      >
        <thead>
          <tr
            style={{
              background: '#f8fafc',
              color: '#475569',
              borderBottom: '1px solid #e2e8f0'
            }}
          >
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: '0.75rem 1rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  textAlign: col.align || 'left',
                  width: col.width
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: '3rem 1rem',
                  textAlign: 'center',
                  color: colors.text.muted,
                  fontStyle: 'italic'
                }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item, idx) => (
              <tr
                key={keyExtractor(item, idx)}
                data-testid={`${testId}-row-${keyExtractor(item, idx)}`}
                style={{
                  borderBottom: '1px solid #f1f5f9',
                  transition: 'background 0.15s ease'
                }}
              >
                {columns.map((col) => {
                  const content = col.render ? col.render(item, idx) : (item as any)[col.key];
                  return (
                    <td
                      key={col.key}
                      style={{
                        padding: '0.75rem 1rem',
                        textAlign: col.align || 'left',
                        verticalAlign: 'middle',
                        color: colors.text.primary
                      }}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
