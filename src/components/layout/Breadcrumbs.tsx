import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { getBreadcrumbs } from '../../config/navigation';

export const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  const crumbs = getBreadcrumbs(location.pathname);

  if (crumbs.length <= 1) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.35rem 2rem 0.45rem',
        fontSize: '0.8rem',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-family)'
      }}
    >
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <React.Fragment key={`${crumb.label}-${idx}`}>
            {idx > 0 && <ChevronRight size={13} style={{ opacity: 0.6 }} />}
            {crumb.route && !isLast ? (
              <Link to={crumb.route} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                {crumb.label}
              </Link>
            ) : (
              <span style={{ color: isLast ? 'var(--text-secondary)' : 'var(--text-muted)', fontWeight: isLast ? 700 : 400 }}>
                {crumb.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
