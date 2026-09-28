import React from 'react';
import { Info } from 'lucide-react';
import type { ArpRecord } from '../../types';
import { Contract360Section } from '../contracts/Contract360Section';

interface Ata360SummaryProps {
  arp: ArpRecord;
}

export const Ata360Summary: React.FC<Ata360SummaryProps> = ({ arp }) => {
  return (
    <Contract360Section
      id="ata-summary-section"
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
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Unidade Gerenciadora / UASG</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
            {arp.nomeUnidadeGerenciadora ? `${arp.nomeUnidadeGerenciadora} (${arp.codigoUnidadeGerenciadora})` : arp.codigoUnidadeGerenciadora}
          </div>
        </div>

        <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Órgão Vinculado</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
            {arp.nomeOrgao || 'Ministério da Justiça e Segurança Pública'}
          </div>
        </div>

        <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Modalidade de Compra</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
            {arp.nomeModalidadeCompra || 'Pregão Eletrônico (SRP)'}
          </div>
        </div>

        <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Número de Controle PNCP</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', wordBreak: 'break-all' }}>
            {arp.numeroControlePncpAta || 'Não informado'}
          </div>
        </div>

        <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Data de Assinatura</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
            {arp.dataAssinatura ? arp.dataAssinatura.split('T')[0].split('-').reverse().join('/') : 'Não informada'}
          </div>
        </div>

        <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Compra Vinculada</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
            {arp.numeroCompra ? `${arp.numeroCompra}/${arp.anoCompra}` : 'Não informada'}
          </div>
        </div>
      </div>
    </Contract360Section>
  );
};
