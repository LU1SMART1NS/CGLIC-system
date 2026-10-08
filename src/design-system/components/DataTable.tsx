import React, { useMemo, useState } from 'react';
import { colors, shapes, spacing, breakpoints } from '../tokens';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { CarteiraSortButton } from '../../components/carteira/CarteiraSortHeader';
import { sortRows, type SortDir, type SortValue } from '../../components/carteira/useCarteiraSort';
import { abrirAoClicarNaLinha } from '../../components/carteira/CarteiraRowLink';
import { ActionButton } from './ActionButton';

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
  /** Valor usado para ordenar por esta coluna; sem ele a coluna não ordena. Vazio vai sempre para o fim. */
  sortValue?: (item: T) => SortValue;
  /** Sentido do primeiro clique (padrão: crescente; use `desc` para números em que o maior importa). */
  sortFirstDir?: SortDir;
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
  /**
   * Linha clicável: devolve o que abrir ao clicar naquela linha, ou nada quando ela não tem destino. A linha toda
   * é o clique (padrão das carteiras); botões e links dentro dela seguem com a ação própria. Para o teclado, ponha
   * um link (CarteiraIdLink) numa das células.
   */
  rowOpen?: (item: T, index: number) => (() => void) | null | undefined;
  /**
   * Detalhes da linha, abertos logo abaixo dela (setinha à esquerda, como a aba Contratos e empenhos do item).
   * Sem `rowOpen`, clicar na linha também abre e fecha.
   */
  renderExpanded?: (item: T, index: number) => React.ReactNode;
  /** Chaves das linhas abertas, quando quem usa a tabela controla (ex.: abrir uma linha vinda de outra aba). */
  expandedKeys?: ReadonlySet<string>;
  onToggleExpand?: (key: string) => void;
  /** Nome da linha para o leitor de tela ("Abrir detalhes de ..."). */
  expandLabel?: (item: T, index: number) => string;
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
  rowStyle,
  rowOpen,
  renderExpanded,
  expandedKeys,
  onToggleExpand,
  expandLabel
}: DataTableProps<T>) {
  const isMobile = useMediaQuery(`(max-width: ${breakpoints.md - 1}px)`);
  const [internalExpanded, setInternalExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const expanded = expandedKeys ?? internalExpanded;
  const toggleExpand = (key: string) => {
    if (onToggleExpand) onToggleExpand(key);
    if (!expandedKeys) {
      setInternalExpanded((atual) => {
        const prox = new Set(atual);
        if (prox.has(key)) prox.delete(key);
        else prox.add(key);
        return prox;
      });
    }
  };
  const openOf = (item: T, idx: number): (() => void) | null | undefined =>
    rowOpen ? rowOpen(item, idx) : renderExpanded ? () => toggleExpand(keyExtractor(item, idx)) : undefined;
  const clickOf = (item: T, idx: number) => {
    const abrir = openOf(item, idx);
    return abrir ? abrirAoClicarNaLinha(abrir) : undefined;
  };
  const expandButton = (item: T, idx: number) => {
    const key = keyExtractor(item, idx);
    const aberto = expanded.has(key);
    const nome = expandLabel?.(item, idx);
    return (
      <ActionButton
        action={aberto ? 'recolher' : 'expandir'}
        iconOnly
        size="sm"
        expanded={aberto}
        label={`${aberto ? 'Recolher' : 'Abrir'} detalhes${nome ? ` de ${nome}` : ''}`}
        onClick={() => toggleExpand(key)}
        data-testid={`${testId}-expand-${key}`}
      />
    );
  };
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);

  // Ordenação estável: sem escolha (ou no terceiro clique) vale a ordem em que `data` chegou.
  const rows = useMemo(() => {
    const col = sort ? columns.find((c) => c.key === sort.key) : undefined;
    return sort && col?.sortValue ? sortRows(data, { value: col.sortValue }, sort.dir) : data;
  }, [data, columns, sort]);

  const toggleSort = (key: string) =>
    setSort((atual) => {
      const first = columns.find((c) => c.key === key)?.sortFirstDir ?? 'asc';
      if (!atual || atual.key !== key) return { key, dir: first };
      return atual.dir === first ? { key, dir: first === 'asc' ? 'desc' : 'asc' } : null;
    });

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
        {rows.length === 0 ? (
          <p className="ds-table-cards__empty" style={{ color: colors.text.muted }}>{emptyMessage}</p>
        ) : (
          <ul className="ds-table-cards__list">
            {rows.map((item, idx) => {
              const key = keyExtractor(item, idx);
              return (
                <li
                  key={key}
                  data-testid={`${testId}-row-${key}`}
                  className={`ds-table-cards__item${openOf(item, idx) ? ' action-row--go' : ''}`}
                  style={rowStyle?.(item, idx)}
                  onClick={clickOf(item, idx)}
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
                          {secondary.map((c) => {
                            const content = cell(c, item, idx);
                            // Campo sem valor (ex.: coluna de ação vazia na linha) não ocupa espaço no cartão.
                            if (content === null || content === undefined || content === false || content === '') return null;
                            return (
                              <div key={c.key} className="ds-table-cards__field">
                                <dt>{c.mobileLabel ?? c.header}</dt>
                                <dd>{content}</dd>
                              </div>
                            );
                          })}
                        </dl>
                      )}
                    </>
                  )}
                  {(rowActions || renderExpanded) && (
                    <div className="ds-table-cards__actions">
                      {rowActions?.(item, idx)}
                      {renderExpanded && expandButton(item, idx)}
                    </div>
                  )}
                  {renderExpanded && expanded.has(key) && (
                    <div className="ds-table__detail" data-testid={`${testId}-detail-${key}`}>
                      {renderExpanded(item, idx)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  const colSpan = columns.length + (rowActions ? 1 : 0) + (renderExpanded ? 1 : 0);

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
            {renderExpanded && <th style={{ width: '44px' }} aria-label="Detalhes" />}
            {columns.map((col) => (
              <th
                key={col.key}
                className={hideClass(col)}
                aria-sort={col.sortValue ? (sort?.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                style={{ textAlign: col.align || 'left', width: col.width, minWidth: col.minWidth, whiteSpace: col.nowrap ? 'nowrap' : undefined }}
              >
                {col.sortValue ? (
                  <CarteiraSortButton
                    label={col.header}
                    sortKey={col.key}
                    activeKey={sort?.key ?? null}
                    activeDir={sort?.dir ?? null}
                    onSort={toggleSort}
                  />
                ) : (
                  col.header
                )}
              </th>
            ))}
            {rowActions && <th style={{ textAlign: 'right' }}>{rowActionsHeader}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="ds-table__empty" style={{ color: colors.text.muted }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((item, idx) => {
              const key = keyExtractor(item, idx);
              const aberto = Boolean(renderExpanded && expanded.has(key));
              return (
                <React.Fragment key={key}>
                  <tr
                    data-testid={`${testId}-row-${key}`}
                    className={[openOf(item, idx) ? 'carteira-row-link' : '', aberto ? 'ds-table__row--open' : ''].filter(Boolean).join(' ') || undefined}
                    style={rowStyle?.(item, idx)}
                    onClick={clickOf(item, idx)}
                  >
                    {renderExpanded && <td data-role="expand" style={{ textAlign: 'center', paddingRight: 0 }}>{expandButton(item, idx)}</td>}
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
                  {aberto && (
                    <tr className="ds-table__detail-row" data-testid={`${testId}-detail-${key}`}>
                      <td colSpan={colSpan} className="ds-table__detail">
                        {renderExpanded!(item, idx)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
