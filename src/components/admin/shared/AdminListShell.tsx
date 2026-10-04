import React from 'react';
import { EmptyState } from '../../../design-system/components/EmptyState';
import { ErrorState } from '../../../design-system/components/ErrorState';
import { SkeletonLoader } from '../../../design-system/components/SkeletonLoader';
import { carteiraTableShell } from '../../carteira/carteiraStyles';

export interface AdminListShellProps {
  /** Título da faixa superior, ex.: "Unidades cadastradas". */
  title: string;
  /** Contagem exibida ao lado do título, ex.: "3 de 12". */
  countLabel?: string;
  /** Texto de apoio sob o título. */
  description?: string;
  /** Ícone à esquerda do título. */
  icon?: React.ReactNode;
  /** Conteúdo à direita da faixa (ex.: seletor de ano). */
  stripActions?: React.ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  errorTitle?: string;
  errorMessage?: string;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  testId?: string;
  /** Tabela (normalmente um DataTable). Só é renderizada com dados e sem erro. */
  children: React.ReactNode;
}

/**
 * Cartão padrão das listas administrativas de Configurações: faixa com título e contagem
 * + os mesmos estados de carregando, erro e vazio em todas as telas.
 */
export const AdminListShell: React.FC<AdminListShellProps> = ({
  title,
  countLabel,
  description,
  icon,
  stripActions,
  isLoading,
  isError,
  errorTitle = 'Não foi possível carregar os dados',
  errorMessage,
  onRetry,
  isEmpty,
  emptyTitle = 'Nenhum registro encontrado.',
  emptyDescription,
  testId,
  children
}) => (
  <div data-testid={testId} style={carteiraTableShell}>
    <div
      style={{
        padding: '0.6rem 1rem',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        flexWrap: 'wrap'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {icon}
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
            {title}
            {countLabel ? ` (${countLabel})` : ''}
          </div>
          {description && <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>{description}</div>}
        </div>
      </div>
      {stripActions}
    </div>
    {isError ? (
      <ErrorState title={errorTitle} message={errorMessage ?? 'Tente novamente em instantes.'} onRetry={onRetry} />
    ) : isLoading ? (
      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <SkeletonLoader variant="card" height="40px" />
        <SkeletonLoader variant="card" height="40px" />
        <SkeletonLoader variant="card" height="40px" />
      </div>
    ) : isEmpty ? (
      <EmptyState title={emptyTitle} description={emptyDescription} />
    ) : (
      children
    )}
  </div>
);
