import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Clock,
  ExternalLink,
  FileText,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ShieldCheck
} from 'lucide-react';
import type { ContractDashboardRecord } from '../../types';

interface Contract360HeaderProps {
  contract: ContractDashboardRecord;
  onBack?: () => void;
}

function formatCnpjDisplay(cnpj?: string): string {
  if (!cnpj) return '';
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  } else if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return cnpj;
}

function formatDateBR(dateStr?: string): string {
  if (!dateStr) return 'Não informada';
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function formatCurrency(val?: number): string {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const Contract360Header: React.FC<Contract360HeaderProps> = ({ contract, onBack }) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/contratos');
    }
  };

  const displayNum = contract.numeroFormatado
    ? `CONTRATO ${contract.numeroFormatado}`
    : `CONTRATO ${contract.numero}/${contract.ano}`;

  const formattedCnpj = formatCnpjDisplay(contract.fornecedorCnpjCpf);
  const pncpUrl =
    contract.linkPncp ||
    (contract.numeroControlePncp
      ? `https://pncp.gov.br/app/contratos/${contract.numeroControlePncp}`
      : undefined);

  return (
    <header
      style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        padding: '1.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        marginBottom: '1.5rem'
      }}
    >
      {/* Barra Superior de Ações e Retorno */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}
      >
        <button
          type="button"
          onClick={handleBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.45rem 0.85rem',
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: 700,
            color: '#0c326f',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <ArrowLeft size={16} /> Voltar para Contratos
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Badge de Procedência / Fonte Oficial */}
          <span
            title={
              contract.lastSyncedAt
                ? `Fonte oficial governamental (${contract.fonteDados}) • Sincronizado em ${new Date(
                    contract.lastSyncedAt
                  ).toLocaleString('pt-BR')}`
                : `Fonte oficial governamental: ${contract.fonteDados}`
            }
            style={{
              fontSize: '0.75rem',
              padding: '0.25rem 0.65rem',
              borderRadius: '6px',
              backgroundColor: '#f8fafc',
              color: '#334155',
              border: '1px solid #cbd5e1',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <ShieldCheck size={14} color="#0c326f" /> Fonte: {contract.fonteDados || 'PNCP'}
          </span>

          {pncpUrl && (
            <a
              href={pncpUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#0284c7',
                backgroundColor: 'rgba(2, 132, 199, 0.08)',
                padding: '0.25rem 0.65rem',
                borderRadius: '6px',
                textDecoration: 'none',
                border: '1px solid rgba(2, 132, 199, 0.2)'
              }}
            >
              Visualizar no PNCP <ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>

      {/* Identificação Principal do Contrato */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            {displayNum}
          </h1>

          {/* Badge de Status Oficial de Vigência */}
          {contract.statusVigencia === 'Expirado' ? (
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
                color: '#dc2626',
                border: '1px solid rgba(239, 68, 68, 0.25)'
              }}
            >
              <AlertTriangle size={14} /> EXPIRADO
            </span>
          ) : contract.statusVigencia === 'A Vencer (60d)' ? (
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
                color: '#d97706',
                border: '1px solid rgba(245, 158, 11, 0.25)'
              }}
            >
              <Clock size={14} /> VENCE EM &lt; 60 DIAS
            </span>
          ) : contract.statusVigencia === 'Vigente' ? (
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
                color: '#059669',
                border: '1px solid rgba(16, 185, 129, 0.25)'
              }}
            >
              <CheckCircle2 size={14} /> VIGENTE
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
                fontWeight: 600,
                backgroundColor: '#f1f5f9',
                color: '#64748b'
              }}
            >
              <HelpCircle size={14} /> VIGÊNCIA NÃO INFORMADA
            </span>
          )}
        </div>

        {contract.objeto && (
          <p
            style={{
              fontSize: '0.92rem',
              color: '#334155',
              margin: '0.5rem 0 0 0',
              lineHeight: '1.45',
              maxWidth: '1200px'
            }}
          >
            {contract.objeto}
          </p>
        )}
      </div>

      {/* Grid de Resumo dos Dados Principais */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid #f1f5f9'
        }}
      >
        {/* Fornecedor */}
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
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Fornecedor / Contratada</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>
              {contract.fornecedorNome || 'Não informado'}
            </div>
            {formattedCnpj && (
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>CNPJ: {formattedCnpj}</div>
            )}
          </div>
        </div>

        {/* Vigência */}
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
              {formatDateBR(contract.dataVigenciaInicio)} a {formatDateBR(contract.dataVigenciaFim)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>UASG: {contract.uasg}</div>
          </div>
        </div>

        {/* Valor Global */}
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
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Valor Global Atualizado</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#059669' }}>
              {formatCurrency(contract.valorGlobal || contract.valorInicial)}
            </div>
            {contract.valorInicial && contract.valorGlobal && contract.valorInicial !== contract.valorGlobal && (
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Inicial: {formatCurrency(contract.valorInicial)}
              </div>
            )}
          </div>
        </div>

        {/* Processo Administrativo */}
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
            <FileText size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Processo Administrativo</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>
              {contract.processo || 'Não informado'}
            </div>
            {contract.idCompra && (
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Compra: {contract.idCompra}</div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
