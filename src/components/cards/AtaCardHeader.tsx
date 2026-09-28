import React from 'react';
import { CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import type { ArpRecord, AdesaoStatusType } from '../../types';
import { AdesaoStatusBadge } from './AdesaoStatusBadge';
import { getArpVigenciaStatus } from '../../services/temporalEngineService';

interface AtaCardHeaderProps {
  arp: ArpRecord;
  fornecedorNome: string;
  fornecedorCnpj?: string;
  adesaoStatus: AdesaoStatusType;
}

function formatCnpjDisplay(cnpj?: string): string {
  if (!cnpj) return '';
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  return cnpj;
}

function formatDateBR(dateStr?: string): string {
  if (!dateStr) return '';
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export const AtaCardHeader: React.FC<AtaCardHeaderProps> = ({
  arp,
  fornecedorNome,
  fornecedorCnpj,
  adesaoStatus
}) => {
  // Format: "ATA 00017/2026"
  const rawNum = arp.numeroAtaRegistroPreco || '';
  const cleanAta = rawNum.replace(/^ATA\s+/i, '');
  const ataDisplay = `ATA ${cleanAta}`;

  const formattedCnpj = formatCnpjDisplay(fornecedorCnpj);

  // Regra de vigência de Ata canônica (Fase 10-A.2 — temporalEngineService.getArpVigenciaStatus).
  const vigenciaStatus = getArpVigenciaStatus(arp.dataVigenciaFinal);
  const isExpired = !!(arp.isCanceladaPncp || vigenciaStatus?.isExpirada);
  const isExpiringSoon = !isExpired && !!vigenciaStatus?.isExpirandoEm90Dias;

  return (
    <header className="ata-card-header">
      <div className="ata-card-header-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <h3 className="ata-card-number">{ataDisplay}</h3>

          {isExpired ? (
            <span 
              className="badge danger" 
              style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#dc2626' }}
            >
              <AlertTriangle size={12} /> EXPIRADA
            </span>
          ) : isExpiringSoon ? (
            <span 
              className="badge warning" 
              style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#d97706' }}
            >
              <Clock size={12} /> VENCE EM &lt; 90 DIAS
            </span>
          ) : (
            <span 
              className="badge success" 
              style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#059669' }}
            >
              <CheckCircle2 size={12} /> VIGENTE
            </span>
          )}

          {arp.dataVigenciaFinal && (
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
              Vigência até: <strong style={{ color: '#334155' }}>{formatDateBR(arp.dataVigenciaFinal)}</strong>
            </span>
          )}
        </div>

        <p className="ata-card-supplier" title={formattedCnpj ? `${fornecedorNome} (${formattedCnpj})` : fornecedorNome} style={{ marginTop: '0.25rem' }}>
          <span>Fornecedor: <strong>{fornecedorNome}</strong></span>
          {formattedCnpj && (
            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500, marginLeft: '0.5rem' }}>
              • CNPJ: {formattedCnpj}
            </span>
          )}
        </p>
      </div>

      <div className="ata-card-header-right" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {arp.prorrogadaPncp && (
          <span 
            className="badge badge-prorrogada" 
            title={`Vigência prorrogada oficialmente no PNCP até ${arp.dataVigenciaFinal}`}
            style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: 600 }}
          >
            Prorrogada PNCP
          </span>
        )}
        <AdesaoStatusBadge status={adesaoStatus} />
      </div>
    </header>
  );
};
