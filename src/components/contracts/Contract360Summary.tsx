import React from 'react';
import { Info } from 'lucide-react';
import type { ContractDashboardRecord } from '../../types';
import { Contract360Section } from './Contract360Section';

interface Contract360SummaryProps {
  contract: ContractDashboardRecord;
}

export const Contract360Summary: React.FC<Contract360SummaryProps> = ({ contract }) => {
  return (
    <Contract360Section
      id="contract-summary-section"
      title="Dados Cadastrais e Administrativos"
      subtitle="Informações oficiais sincronizadas a partir das bases governamentais"
      icon={Info}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1rem'
        }}
      >
        <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Unidade Gestora / UASG</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
            {contract.nomeUnidadeGestora ? `${contract.nomeUnidadeGestora} (${contract.uasg})` : contract.uasg}
          </div>
        </div>

        <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Órgão Vinculado</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
            {contract.nomeOrgao || 'Ministério da Justiça e Segurança Pública'}
          </div>
        </div>

        <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Modalidade de Compra</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
            {contract.modalidadeCompra || 'Pregão Eletrônico (SRP)'}
          </div>
        </div>

        <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Número de Controle PNCP</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', wordBreak: 'break-all' }}>
            {contract.numeroControlePncp || 'Não informado'}
          </div>
        </div>

        <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Data de Assinatura</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
            {contract.dataAssinatura ? contract.dataAssinatura.split('T')[0].split('-').reverse().join('/') : 'Não informada'}
          </div>
        </div>

        <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>ID da Compra / Sequencial</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
            {contract.idCompra || contract.contratoId || 'N/A'}
          </div>
        </div>
      </div>
    </Contract360Section>
  );
};
