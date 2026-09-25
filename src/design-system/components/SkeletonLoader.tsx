import React from 'react';
import { colors, shapes, spacing } from '../tokens';

export interface SkeletonLoaderProps {
  variant?: 'text' | 'rectangular' | 'circular' | 'card';
  width?: string;
  height?: string;
  count?: number;
  testId?: string;
  className?: string;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  variant = 'text',
  width = '100%',
  height,
  count = 1,
  testId = 'skeleton-loader',
  className = ''
}) => {
  const getDefaultHeight = () => {
    switch (variant) {
      case 'circular':
        return width !== '100%' ? width : '40px';
      case 'card':
        return '140px';
      case 'rectangular':
        return '60px';
      case 'text':
      default:
        return '16px';
    }
  };

  const getBorderRadius = () => {
    switch (variant) {
      case 'circular':
        return shapes.radius.full;
      case 'card':
        return shapes.radius.xl;
      case 'rectangular':
        return shapes.radius.md;
      case 'text':
      default:
        return shapes.radius.sm;
    }
  };

  const resolvedHeight = height || getDefaultHeight();
  const borderRadius = getBorderRadius();

  return (
    <div
      data-testid={testId}
      aria-busy="true"
      aria-label="Carregando conteúdo..."
      className={`skeleton-loader-container ${className}`.trim()}
      style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, width: '100%' }}
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="animate-pulse"
          style={{
            width,
            height: resolvedHeight,
            background: colors.background.muted,
            borderRadius
          }}
        />
      ))}
    </div>
  );
};
