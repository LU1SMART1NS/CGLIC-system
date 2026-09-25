import React from 'react';
import { Search, X, Filter } from 'lucide-react';
import { colors, shapes, typography, spacing } from '../tokens';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterBarProps {
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  selects?: Array<{
    id: string;
    label: string;
    value: string;
    options: FilterOption[];
    onChange: (val: string) => void;
  }>;
  chips?: Array<{
    id: string;
    label: string;
    active: boolean;
    onClick: () => void;
    count?: number;
  }>;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  testId?: string;
  className?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Buscar registros...',
  selects = [],
  chips = [],
  hasActiveFilters = false,
  onClearFilters,
  testId,
  className = ''
}) => {
  return (
    <div
      data-testid={testId || 'filter-bar'}
      className={`filter-bar ${className}`.trim()}
      style={{
        background: colors.background.surface,
        border: `1px solid ${colors.border.default}`,
        borderRadius: shapes.radius.xl,
        padding: spacing.md,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.md,
        boxShadow: shapes.shadow.sm
      }}
    >
      {/* Search & Dropdown Selects */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}>
        {/* Campo de Busca */}
        {onSearchChange && (
          <div
            style={{
              position: 'relative',
              flex: '1 1 220px',
              minWidth: '200px'
            }}
          >
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: spacing.sm,
                top: '50%',
                transform: 'translateY(-50%)',
                color: colors.text.subtle
              }}
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              style={{
                width: '100%',
                padding: `${spacing.xs} ${spacing.sm} ${spacing.xs} ${spacing['2xl']}`,
                borderRadius: shapes.radius.md,
                border: `1px solid ${colors.border.default}`,
                background: colors.background.base,
                fontSize: typography.fontSize.bodySm,
                color: colors.text.primary,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
        )}

        {/* Dropdowns */}
        {selects.map((sel) => (
          <div key={sel.id} style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flex: '0 1 auto' }}>
            <label
              htmlFor={`select-${sel.id}`}
              style={{ fontSize: typography.fontSize.label, fontWeight: typography.fontWeight.semibold, color: colors.text.secondary, whiteSpace: 'nowrap' }}
            >
              {sel.label}:
            </label>
            <select
              id={`select-${sel.id}`}
              value={sel.value}
              onChange={(e) => sel.onChange(e.target.value)}
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
                borderRadius: shapes.radius.md,
                border: `1px solid ${colors.border.default}`,
                background: colors.background.surface,
                fontSize: typography.fontSize.bodySm,
                color: colors.text.primary,
                cursor: 'pointer'
              }}
            >
              {sel.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ))}

        {/* Limpar Filtros */}
        {hasActiveFilters && onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            data-testid="filter-bar-clear-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: spacing.xxs,
              padding: `${spacing.xs} ${spacing.sm}`,
              borderRadius: shapes.radius.md,
              border: `1px solid ${colors.semantic.danger.border}`,
              background: colors.semantic.danger.bg,
              color: colors.semantic.danger.text,
              fontSize: typography.fontSize.label,
              fontWeight: typography.fontWeight.bold,
              cursor: 'pointer'
            }}
          >
            <X size={12} aria-hidden="true" />
            <span>Limpar Filtros</span>
          </button>
        )}
      </div>

      {/* Chips Rápidos */}
      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xxs, color: colors.text.muted, fontSize: typography.fontSize.caption, marginRight: spacing.xs }}>
            <Filter size={12} aria-hidden="true" />
            <span>Filtrar por:</span>
          </div>
          {chips.map((chip) => {
            return (
              <button
                key={chip.id}
                type="button"
                onClick={chip.onClick}
                data-testid={`filter-chip-${chip.id}`}
                aria-pressed={chip.active}
                style={{
                  padding: `${spacing.xxs} ${spacing.sm}`,
                  borderRadius: shapes.radius.full,
                  fontSize: typography.fontSize.label,
                  fontWeight: chip.active ? typography.fontWeight.bold : typography.fontWeight.medium,
                  border: `1px solid ${chip.active ? colors.brand.primary : colors.border.default}`,
                  background: chip.active ? colors.brand.primaryLight : colors.background.surface,
                  color: chip.active ? colors.brand.primaryDark : colors.text.secondary,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: spacing.xxs,
                  transition: shapes.transition.fast
                }}
              >
                <span>{chip.label}</span>
                {chip.count !== undefined && (
                  <span
                    style={{
                      fontSize: typography.fontSize.caption,
                      fontWeight: typography.fontWeight.bold,
                      padding: `0 ${spacing.xxs}`,
                      borderRadius: shapes.radius.full,
                      background: chip.active ? colors.brand.primary : colors.background.subtle,
                      color: chip.active ? colors.text.inverse : colors.text.secondary
                    }}
                  >
                    {chip.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
