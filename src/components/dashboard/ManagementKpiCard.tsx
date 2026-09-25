import React from 'react';
import { AlertCircle, Inbox } from 'lucide-react';

export type ManagementKpiCardVariant = 'default' | 'primary' | 'success' | 'warning' | 'info';

export interface ManagementKpiCardProps {
  title: string;
  value?: React.ReactNode;
  unit?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  description?: React.ReactNode;
  subContent?: React.ReactNode;
  variant?: ManagementKpiCardVariant;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  isEmpty?: boolean;
  emptyMessage?: string;
  testId?: string;
  ariaLabel?: string;
}

const variantStyles: Record<ManagementKpiCardVariant, {
  topBorder: string;
  iconBg: string;
  iconColor: string;
  valueColor: string;
}> = {
  default: {
    topBorder: '#3b82f6',
    iconBg: '#eff6ff',
    iconColor: '#2563eb',
    valueColor: '#0f172a'
  },
  primary: {
    topBorder: '#0284c7',
    iconBg: '#e0f2fe',
    iconColor: '#0284c7',
    valueColor: '#0369a1'
  },
  success: {
    topBorder: '#10b981',
    iconBg: '#ecfdf5',
    iconColor: '#059669',
    valueColor: '#065f46'
  },
  warning: {
    topBorder: '#f59e0b',
    iconBg: '#fef3c7',
    iconColor: '#d97706',
    valueColor: '#b45309'
  },
  info: {
    topBorder: '#6366f1',
    iconBg: '#eef2ff',
    iconColor: '#4f46e5',
    valueColor: '#3730a3'
  }
};

/**
 * Card Executivo Reutilizável do Dashboard Gerencial (SaldoARP 3.0 — Fase 8-C)
 * 
 * Garantias:
 * 1. Não exibe "0" em estado de loading;
 * 2. Não converte erro em zero;
 * 3. Exibe mensagem descritiva no estado vazio;
 * 4. Acessibilidade nativa e semântica com ARIA;
 * 5. Não realiza nenhum cálculo de regra de negócio embutido.
 */
export const ManagementKpiCard: React.FC<ManagementKpiCardProps> = ({
  title,
  value,
  unit,
  icon,
  badge,
  description,
  subContent,
  variant = 'default',
  isLoading = false,
  isError = false,
  errorMessage = 'Erro ao carregar dados deste indicador',
  isEmpty = false,
  emptyMessage = 'Nenhum dado registrado',
  testId,
  ariaLabel
}) => {
  const currentVariant = variantStyles[variant] || variantStyles.default;

  // 1. Estado de Loading (Skeleton)
  if (isLoading) {
    return (
      <article
        data-testid={testId ? `${testId}-loading` : 'management-kpi-card-loading'}
        aria-busy="true"
        aria-label={`Carregando ${title}`}
        className="management-kpi-card animate-pulse"
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '1px solid #e2e8f0',
          borderTop: `4px solid ${currentVariant.topBorder}`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '160px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ width: '60%' }}>
            <div style={{ height: '12px', background: '#e2e8f0', borderRadius: '4px', width: '80%' }}></div>
            <div style={{ height: '28px', background: '#cbd5e1', borderRadius: '6px', width: '100%', marginTop: '0.75rem' }}></div>
          </div>
          <div style={{ width: '38px', height: '38px', background: '#e2e8f0', borderRadius: '8px' }}></div>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <div style={{ height: '10px', background: '#f1f5f9', borderRadius: '4px', width: '90%' }}></div>
        </div>
      </article>
    );
  }

  // 2. Estado de Erro Explícito (Nunca vira zero)
  if (isError) {
    return (
      <article
        data-testid={testId ? `${testId}-error` : 'management-kpi-card-error'}
        role="alert"
        aria-label={`Erro no indicador ${title}: ${errorMessage}`}
        className="management-kpi-card"
        style={{
          background: '#fef2f2',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '1px solid #fecaca',
          borderTop: '4px solid #ef4444',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '160px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#991b1b' }}>
              {title}
            </span>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#b91c1c', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <AlertCircle size={16} aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#7f1d1d' }}>
          Tente atualizar a página ou verifique a conexão com os serviços oficiais.
        </div>
      </article>
    );
  }

  // 3. Estado Vazio Explícito (Nunca zero solto sem contexto)
  if (isEmpty) {
    return (
      <article
        data-testid={testId ? `${testId}-empty` : 'management-kpi-card-empty'}
        className="management-kpi-card"
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '1px solid #e2e8f0',
          borderTop: '4px solid #94a3b8',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '160px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>
              {title}
            </span>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#64748b', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Inbox size={18} aria-hidden="true" />
              <span>{emptyMessage}</span>
            </div>
          </div>
          {icon && (
            <div style={{ padding: '0.5rem', background: '#f1f5f9', borderRadius: '8px', color: '#94a3b8' }}>
              {icon}
            </div>
          )}
        </div>
        {description && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: '#94a3b8' }}>
            {description}
          </div>
        )}
      </article>
    );
  }

  // 4. Estado Normal de Apresentação
  return (
    <article
      data-testid={testId || 'management-kpi-card'}
      aria-label={ariaLabel || `${title}: ${typeof value === 'string' || typeof value === 'number' ? value : ''}`}
      className="management-kpi-card"
      style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '1.25rem',
        border: '1px solid #e2e8f0',
        borderTop: `4px solid ${currentVariant.topBorder}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '160px',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease'
      }}
    >
      <div>
        {/* Cabeçalho do Card */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
          <div>
            <h4
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: '#64748b',
                margin: 0
              }}
            >
              {title}
            </h4>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {badge && <div>{badge}</div>}
            {icon && (
              <div
                style={{
                  padding: '0.5rem',
                  background: currentVariant.iconBg,
                  borderRadius: '8px',
                  color: currentVariant.iconColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                aria-hidden="true"
              >
                {icon}
              </div>
            )}
          </div>
        </div>

        {/* Valor Principal */}
        <div style={{ marginTop: '0.5rem' }}>
          <div
            style={{
              fontSize: '1.65rem',
              fontWeight: 800,
              color: currentVariant.valueColor,
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
              wordBreak: 'break-word'
            }}
          >
            {value}
            {unit && (
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b', marginLeft: '0.35rem' }}>
                {unit}
              </span>
            )}
          </div>
        </div>

        {/* Conteúdo Secundário / Progresso */}
        {subContent && (
          <div style={{ marginTop: '0.5rem' }}>
            {subContent}
          </div>
        )}
      </div>

      {/* Descrição / Rodapé */}
      {description && (
        <div
          style={{
            marginTop: '0.75rem',
            fontSize: '0.78rem',
            color: '#475569',
            borderTop: '1px solid #f1f5f9',
            paddingTop: '0.5rem'
          }}
        >
          {description}
        </div>
      )}
    </article>
  );
};
