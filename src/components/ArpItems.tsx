import React, { useState, useEffect } from 'react';
import { ChevronLeft, HelpCircle, Eye, Users, Award, ExternalLink, DollarSign, RefreshCw, CheckCircle, Package } from 'lucide-react';
import { fetchArpItems, fetchPncpAtaVigencia, enrichArpWithPncpVigencia } from '../services/api';
import { cacheArpsInDb } from '../services/dbCacheService';
import { formatPncpAtaUrl, formatPncpCompraUrl } from '../utils/pncpUtils';
import { AppCard, AppButton, PageHeader } from '../design-system';
import type { ArpRecord, ArpItemRecord } from '../types';

interface ArpItemsProps {
  arp: ArpRecord;
  onSelectItem: (item: ArpItemRecord) => void;
  onBack: () => void;
}

export const ArpItems: React.FC<ArpItemsProps> = ({ arp, onSelectItem, onBack }) => {
  const [currentArp, setCurrentArp] = useState<ArpRecord>(arp);
  const [items, setItems] = useState<ArpItemRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadItemsData = async (forceSync = false) => {
    if (forceSync) {
      setIsSyncing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      let workingArp = { ...currentArp };

      // 1. Enriquece a vigência oficial e cancelamento diretamente do PNCP
      if (workingArp.numeroControlePncpAta) {
        const pncpInfo = await fetchPncpAtaVigencia(workingArp.numeroControlePncpAta);
        if (pncpInfo) {
          workingArp = enrichArpWithPncpVigencia(workingArp, pncpInfo);
          setCurrentArp(workingArp);
          cacheArpsInDb([workingArp]);
        }
      }

      // 2. Busca os itens da Ata
      const data = await fetchArpItems(
        workingArp.dataVigenciaInicial,
        workingArp.codigoUnidadeGerenciadora,
        workingArp.numeroAtaRegistroPreco,
        workingArp
      );
      
      let filtered = data.resultado || [];
      
      if (workingArp.numeroControlePncpAta) {
        filtered = filtered.filter(item => 
          !item.numeroControlePncpAta || item.numeroControlePncpAta === workingArp.numeroControlePncpAta
        );
      }
      
      filtered.sort((a, b) => {
        const numA = parseInt(a.numeroItem, 10) || 0;
        const numB = parseInt(b.numeroItem, 10) || 0;
        return numA - numB;
      });

      setItems(filtered);
      const nowTime = new Date().toLocaleTimeString('pt-BR');
      setSyncStatus(`Dados sincronizados com o Compras.gov/PNCP às ${nowTime}`);
      if (filtered.length === 0) {
        setError('Nenhum item localizado para esta Ata de Registro de Preços.');
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao buscar os itens da Ata.');
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    setCurrentArp(arp);
    loadItemsData(false);
  }, [arp]);

  const handleManualSyncClick = () => {
    loadItemsData(true);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatNumber = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(val);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Helper to check allocations and empenho links in localStorage for an item
  const checkItemStatus = (numeroItem: string) => {
    let hasAllocations = false;
    let hasEmpenhos = false;

    try {
      const allocKey = `saldoarp-allocations-${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}-${numeroItem}`;
      const allocData = JSON.parse(localStorage.getItem(allocKey) || '[]');
      if (allocData.length > 0) {
        hasAllocations = true;
      }

      const linksKey = `saldoarp-empenho-links-${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}-${numeroItem}`;
      const linksData = JSON.parse(localStorage.getItem(linksKey) || '{}');
      if (Object.keys(linksData).length > 0) {
        hasEmpenhos = true;
      }
    } catch {
      // Ignorar erros de parse do localStorage
    }

    return { hasAllocations, hasEmpenhos };
  };

  const ataUrl = formatPncpAtaUrl(currentArp.linkAtaPNCP, currentArp.numeroControlePncpAta, currentArp.numeroAtaRegistroPreco);
  const compraUrl = formatPncpCompraUrl(currentArp.linkCompraPNCP, currentArp.numeroControlePncpCompra, currentArp.numeroControlePncpAta);

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1.5rem 2rem 3rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Sovereign PageHeader */}
      <PageHeader
        title={`Itens Registrados na Ata nº ${currentArp.numeroAtaRegistroPreco}`}
        subtitle={`${currentArp.nomeUnidadeGerenciadora} • UASG: ${currentArp.codigoUnidadeGerenciadora}`}
        icon={<Package size={26} color="#0c326f" aria-hidden="true" />}
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <AppButton
              variant="outline"
              size="sm"
              icon={<ChevronLeft size={14} />}
              onClick={onBack}
            >
              Voltar para Atas
            </AppButton>
            <AppButton
              variant="outline"
              size="sm"
              icon={<RefreshCw size={14} className={isSyncing ? 'spin-animation' : ''} />}
              onClick={handleManualSyncClick}
              disabled={isSyncing}
              isLoading={isSyncing}
            >
              {isSyncing ? 'Sincronizando...' : 'Sincronizar com API'}
            </AppButton>
          </div>
        }
      />

      {/* Modern Executive ARP Info Card */}
      <AppCard style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>
            Ata nº {currentArp.numeroAtaRegistroPreco}
          </span>
          <span style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>
            UASG: {currentArp.codigoUnidadeGerenciadora}
          </span>
          {currentArp.prorrogadaPncp && (
            <span style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle size={12} /> Prorrogada no PNCP até {formatDate(currentArp.dataVigenciaFinal)}
            </span>
          )}
          {syncStatus && (
            <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: '6px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600 }}>
              ✓ {syncStatus}
            </span>
          )}
        </div>

        {/* 4-column Executive Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
          <div className="meta-field">
            <span className="meta-label" style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#0c326f', display: 'block', marginBottom: '0.25rem' }}>
              Objeto da Ata
            </span>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5', textAlign: 'justify' }}>
              {currentArp.objeto || 'Não informado'}
            </div>
          </div>

          <div className="meta-field">
            <span className="meta-label" style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#0c326f', display: 'block', marginBottom: '0.25rem' }}>
              Órgão Superior
            </span>
            <span className="meta-value" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, display: 'block' }}>
              {currentArp.nomeOrgao || currentArp.nomeUnidadeGerenciadora}
            </span>
          </div>

          <div className="meta-field">
            <span className="meta-label" style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#0c326f', display: 'block', marginBottom: '0.25rem' }}>
              Vigência
            </span>
            <span className="meta-value" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, display: 'block' }}>
              {formatDate(currentArp.dataVigenciaInicial)} a {formatDate(currentArp.dataVigenciaFinal)}
            </span>
          </div>

          <div className="meta-field">
            <span className="meta-label" style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: '#0c326f', display: 'block', marginBottom: '0.25rem' }}>
              Valor Total da Ata
            </span>
            <span className="meta-value" style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--success)', fontFamily: 'monospace', display: 'block' }}>
              {formatCurrency(currentArp.valorTotal)}
            </span>
          </div>
        </div>

        {/* PNCP External Links */}
        {(ataUrl || compraUrl) && (
          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {ataUrl && (
              <a href={ataUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <AppButton variant="outline" size="sm" icon={<ExternalLink size={13} />}>
                  Ver Ata no PNCP
                </AppButton>
              </a>
            )}
            {compraUrl && (
              <a href={compraUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <AppButton variant="outline" size="sm" icon={<ExternalLink size={13} />}>
                  Ver Edital / Contratação no PNCP
                </AppButton>
              </a>
            )}
          </div>
        )}
      </AppCard>

      {/* Items Section */}
      <AppCard style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0c326f', margin: 0, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Package size={18} color="#0c326f" /> Itens Registrados na Ata ({items.length})
        </h3>

        {loading ? (
          <div className="spinner-container">
            <div className="spinner spinner-glow"></div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Carregando catálogo de itens da ata...</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <HelpCircle size={40} className="empty-state-icon" />
            <p style={{ fontSize: '0.95rem' }}>{error}</p>
          </div>
        ) : (
          <div className="items-grid">
            {items.map((item, idx) => {
              const { hasAllocations, hasEmpenhos } = checkItemStatus(item.numeroItem);

              return (
                <div key={`${item.numeroItem}-${idx}`} className="item-card">
                  <div className="item-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>
                        Item {item.numeroItem}
                      </span>
                      {item.tipoItem && (
                        <span style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 600 }}>
                          {item.tipoItem}
                        </span>
                      )}
                      <span style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 600 }}>
                        Código: {item.codigoItem}
                      </span>

                      {/* Status Indicators */}
                      {hasAllocations && (
                        <span 
                          title="Item possui alocação interna realizada"
                          style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '0.2rem',
                            fontSize: '0.62rem', 
                            fontWeight: 800, 
                            padding: '2px 6px', 
                            borderRadius: '4px', 
                            background: '#e3f2fd', 
                            color: '#1565c0', 
                            border: '1px solid #90caf9' 
                          }}
                        >
                          <Users size={10} /> ALOCADO
                        </span>
                      )}

                      {hasEmpenhos && (
                        <span 
                          title="Item possui empenhos vinculados"
                          style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '0.2rem',
                            fontSize: '0.62rem', 
                            fontWeight: 800, 
                            padding: '2px 6px', 
                            borderRadius: '4px', 
                            background: '#e8f5e9', 
                            color: '#2e7d32', 
                            border: '1px solid #a5d6a7' 
                          }}
                        >
                          <DollarSign size={10} /> EMPENHADO
                        </span>
                      )}
                    </div>
                    <AppButton 
                      variant="primary"
                      size="sm"
                      icon={<Eye size={13} />}
                      onClick={() => onSelectItem(item)}
                    >
                      Saldos & Órgãos
                    </AppButton>
                  </div>

                  <div className="item-description">
                    {item.descricaoItem}
                  </div>

                  {/* Neutrally styled item metadata container */}
                  <div className="item-metadata" style={{ padding: '0.75rem', background: '#f8f9fa', borderRadius: '4px', border: '1px solid #e9ecef' }}>
                    <div className="meta-field">
                      <span className="meta-label">
                        <Award size={10} style={{ marginRight: '2px' }} /> Fornecedor Detentor
                      </span>
                      <span className="meta-value" style={{ fontSize: '0.8rem', fontWeight: 600 }} title={item.nomeRazaoSocialFornecedor}>
                        {item.nomeRazaoSocialFornecedor}
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 400 }}>
                          CNPJ/CPF: {item.niFornecedor.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}
                        </div>
                      </span>
                    </div>

                    <div className="meta-field">
                      <span className="meta-label">Qtd Homologada</span>
                      <span className="meta-value" style={{ fontFamily: 'monospace', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {formatNumber(item.quantidadeHomologadaItem)}
                      </span>
                    </div>

                    <div className="meta-field">
                      <span className="meta-label">Valor Unitário</span>
                      <span className="meta-value-price" style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontWeight: 600 }}>
                        {formatCurrency(item.valorUnitario)}
                      </span>
                    </div>

                    <div className="meta-field">
                      <span className="meta-label">Valor Total</span>
                      <span className="meta-value-price" style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontWeight: 700 }}>
                        {formatCurrency(item.valorTotal)}
                      </span>
                    </div>

                    <div className="meta-field">
                      <span className="meta-label" style={{ display: 'flex', alignItems: 'center' }}>
                        <Users size={10} style={{ marginRight: '2px' }} /> Limite Carona (Máx)
                      </span>
                      <span className="meta-value" style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontWeight: 600 }}>
                        {item.maximoAdesao > 0 ? `${formatNumber(item.maximoAdesao)} un` : 'Não aceita carona'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AppCard>
    </div>
  );
};
