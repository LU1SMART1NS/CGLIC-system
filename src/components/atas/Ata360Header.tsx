import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  Package,
  Building2,
  AlertTriangle,
  Clock,
  CheckCircle2
} from 'lucide-react';
import type { ArpRecord, ArpItemRecord } from '../../types';
import { getArpVigenciaStatus } from '../../services/temporalEngineService';
import { AtaManagerSelector } from '../cards/AtaManagerSelector';

interface Ata360HeaderProps {
  arp: ArpRecord;
  itens: ArpItemRecord[];
  onBack?: () => void;
}

function formatDateBR(dateStr?: string): string {
  if (!dateStr) return 'Não informada';
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const Ata360Header: React.FC<Ata360HeaderProps> = ({ arp, itens, onBack }) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) onBack();
    else navigate('/atas');
  };

  const vigenciaStatus = getArpVigenciaStatus(arp.dataVigenciaFinal);
  const isExpired = Boolean(arp.isCanceladaPncp || vigenciaStatus?.isExpirada);
  const isExpiringSoon = !isExpired && Boolean(vigenciaStatus?.isExpirandoEm90Dias);

  const fornecedoresUnicos = new Set(itens.map((i) => i.nomeRazaoSocialFornecedor).filter(Boolean));

  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        padding: '1.25rem 1.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        marginBottom: '1.25rem'
      }}
    >
      <button
        type="button"
        onClick={handleBack}
        data-testid="ata-360-back-btn"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '0.35rem 0.7rem',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          fontSize: '0.8rem',
          fontWeight: 700,
          color: '#475569',
          cursor: 'pointer',
          marginBottom: '1rem'
        }}
      >
        <ArrowLeft size={16} /> Voltar para Atas
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Package size={26} color="#0c326f" aria-hidden="true" />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Ata {arp.numeroAtaRegistroPreco}
          </h1>
        </div>

        {isExpired ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '0.25rem 0.65rem',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 800,
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: '#dc2626'
            }}
          >
            <AlertTriangle size={14} /> EXPIRADA
          </span>
        ) : isExpiringSoon ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '0.25rem 0.65rem',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 800,
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              color: '#d97706'
            }}
          >
            <Clock size={14} /> VENCE EM ATÉ 90 DIAS
          </span>
        ) : (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '0.25rem 0.65rem',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 800,
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              color: '#059669'
            }}
          >
            <CheckCircle2 size={14} /> VIGENTE
          </span>
        )}
      </div>

      {arp.objeto && (
        <p style={{ fontSize: '0.88rem', color: '#475569', margin: '0 0 1rem 0', maxWidth: '900px' }}>
          {arp.objeto}
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid #f1f5f9'
        }}
      >
        <AtaManagerSelector ataKey={arp.numeroAtaRegistroPreco} />

        <div style={{ display: 'flex', gap: '0.65rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              color: '#0c326f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <Calendar size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Vigência Oficial</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>
              {formatDateBR(arp.dataVigenciaInicial)} a {formatDateBR(arp.dataVigenciaFinal)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>UASG: {arp.codigoUnidadeGerenciadora}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <DollarSign size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Valor Total Registrado</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#059669' }}>
              {formatCurrency(arp.valorTotal)}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              color: '#0c326f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <Building2 size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Itens / Fornecedores</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>
              {itens.length} {itens.length === 1 ? 'item' : 'itens'} · {fornecedoresUnicos.size || 1} fornecedor(es)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
