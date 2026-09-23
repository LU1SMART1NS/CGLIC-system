import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface Contract360SectionProps {
  id?: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  badge?: {
    text: string;
    variant?: 'neutral' | 'info' | 'warning' | 'success';
  };
  actions?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const BADGE_STYLES = {
  neutral: { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
  info: { bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' },
  warning: { bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
  success: { bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' }
};

export const Contract360Section: React.FC<Contract360SectionProps> = ({
  id,
  title,
  subtitle,
  icon: Icon,
  badge,
  actions,
  children,
  style
}) => {
  const badgeStyle = badge ? BADGE_STYLES[badge.variant || 'neutral'] : null;

  return (
    <section
      id={id}
      style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        padding: '1.25rem 1.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        marginBottom: '1.25rem',
        ...style
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
          borderBottom: '1px solid #f1f5f9',
          paddingBottom: '0.75rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {Icon && (
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(12, 50, 111, 0.08)',
                color: '#0c326f',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Icon size={18} />
            </div>
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                {title}
              </h3>
              {badge && badgeStyle && (
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: badgeStyle.bg,
                    color: badgeStyle.color,
                    border: `1px solid ${badgeStyle.border}`
                  }}
                >
                  {badge.text}
                </span>
              )}
            </div>
            {subtitle && (
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0.15rem 0 0 0' }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {actions && <div>{actions}</div>}
      </div>

      <div>{children}</div>
    </section>
  );
};
