import React from 'react';

export const ContractCardSkeleton: React.FC = () => {
  return (
    <div className="ata-card ata-card-skeleton" aria-hidden="true" style={{ marginBottom: '1.25rem' }}>
      <div className="ata-card-header">
        <div className="ata-card-header-left">
          <div className="skeleton-box skeleton-title" style={{ width: '180px', height: '24px' }} />
          <div className="skeleton-box skeleton-subtitle" style={{ width: '280px', height: '16px', marginTop: '8px' }} />
        </div>
        <div className="ata-card-header-right">
          <div className="skeleton-box skeleton-badge" style={{ width: '100px', height: '24px' }} />
        </div>
      </div>

      <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #f1f5f9' }}>
        <div className="skeleton-box" style={{ width: '90%', height: '16px', marginBottom: '8px' }} />
        <div className="skeleton-box" style={{ width: '60%', height: '16px', marginBottom: '16px' }} />
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <div className="skeleton-box" style={{ width: '120px', height: '20px' }} />
          <div className="skeleton-box" style={{ width: '140px', height: '20px' }} />
          <div className="skeleton-box" style={{ width: '160px', height: '20px' }} />
        </div>
      </div>
    </div>
  );
};
