import React from 'react';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { formatPncpAtaUrl, formatPncpCompraUrl } from '../../utils/pncpUtils';
import { formatCurrency, formatNumber } from './itemBalanceUtils';
import type { ArpRecord, ArpItemRecord } from '../../types';

export interface ItemBalancesHeaderProps {
  arp: ArpRecord;
  item: ArpItemRecord;
  onBack: () => void;
}

export const ItemBalancesHeader: React.FC<ItemBalancesHeaderProps> = ({ arp, item, onBack }) => {
  const ataUrl = formatPncpAtaUrl(arp.linkAtaPNCP, arp.numeroControlePncpAta, arp.numeroAtaRegistroPreco);
  const compraUrl = formatPncpCompraUrl(arp.linkCompraPNCP, arp.numeroControlePncpCompra, arp.numeroControlePncpAta);

  return (
    <>
      {/* Navigation Breadcrumb */}
      <div className="breadcrumb">
        <span className="breadcrumb-item" style={{ cursor: 'pointer' }} onClick={onBack}>
          Ata {arp.numeroAtaRegistroPreco}
        </span>
        <span style={{ margin: '0 0.25rem' }}>/</span>
        <span className="breadcrumb-item active">Item {item.numeroItem}</span>
      </div>

      {/* Item info overview */}
      <section className="glass-card" style={{ background: 'linear-gradient(135deg, #f0f5fc 0%, #e1ebf8 100%)', borderColor: '#b2cbe6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1.25rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="item-number">Item {item.numeroItem}</span>
              <span className="badge badge-info">{item.tipoItem}</span>
              <span className="badge badge-success">Preço Unitário: {formatCurrency(item.valorUnitario)}</span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
              {item.descricaoItem}
            </h2>
          </div>
          <button onClick={onBack} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
            <ChevronLeft size={16} /> Voltar aos itens
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
          <div className="meta-field">
            <span className="meta-label">Fornecedor</span>
            <span className="meta-value" style={{ color: 'var(--text-secondary)' }}>{item.nomeRazaoSocialFornecedor}</span>
          </div>
          <div className="meta-field">
            <span className="meta-label">Quantidade Original</span>
            <span className="meta-value">{formatNumber(item.quantidadeHomologadaItem)} unidades</span>
          </div>
          <div className="meta-field">
            <span className="meta-label">Valor Total do Item</span>
            <span className="meta-value" style={{ fontWeight: 600, color: 'var(--accent)' }}>{formatCurrency(item.valorTotal)}</span>
          </div>
          <div className="meta-field">
            <span className="meta-label">Situação Sicap / Adesão</span>
            <span className="meta-value" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              {item.maximoAdesao > 0 ? (
                <span className="badge badge-success">Aceita Adesão</span>
              ) : (
                <span className="badge badge-danger">Não Aceita Adesão</span>
              )}
            </span>
          </div>
        </div>

        {/* Links externos para PNCP */}
        {(ataUrl || compraUrl) && (
          <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {ataUrl && (
              <a 
                href={ataUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600, color: '#0369a1', borderColor: '#bae6fd', background: '#f0f9ff', padding: '0.3rem 0.65rem' }}
              >
                <ExternalLink size={12} /> Ver Ata no PNCP
              </a>
            )}
            {compraUrl && (
              <a 
                href={compraUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600, color: '#0369a1', borderColor: '#bae6fd', background: '#f0f9ff', padding: '0.3rem 0.65rem' }}
              >
                <ExternalLink size={12} /> Ver Edital / Contratação no PNCP
              </a>
            )}
          </div>
        )}
      </section>
    </>
  );
};
