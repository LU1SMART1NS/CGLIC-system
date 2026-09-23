import React from 'react';
import { GitBranch, AlertCircle, RefreshCw } from 'lucide-react';
import type { ContractDashboardRecord, ContractTaskPlan } from '../../types';
import { useContractWorkflows } from '../../hooks/useContractWorkflows';
import { ContractWorkflowCard } from './ContractWorkflowCard';

export interface ContractWorkflowsSectionProps {
  contract: ContractDashboardRecord;
  plan?: ContractTaskPlan | null;
  isLoading?: boolean;
}

export const ContractWorkflowsSection: React.FC<ContractWorkflowsSectionProps> = ({
  contract,
  plan,
  isLoading: externalLoading
}) => {
  const {
    workflows,
    activeCount,
    completedCount,
    isLoading: internalLoading,
    error
  } = useContractWorkflows(contract, plan);

  const isLoading = externalLoading || internalLoading;

  // 1. Estado de Carregamento (Loading Skeleton)
  if (isLoading) {
    return (
      <div
        style={{
          padding: '2rem',
          backgroundColor: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          textAlign: 'center'
        }}
        aria-busy="true"
        aria-label="Carregando workflows operacionais"
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', color: '#64748b' }}>
          <RefreshCw size={20} className="animate-spin" />
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
            Verificando workflows operacionais do contrato...
          </span>
        </div>
      </div>
    );
  }

  // 2. Estado de Erro
  if (error) {
    return (
      <div
        style={{
          padding: '1.5rem',
          backgroundColor: '#fef2f2',
          borderRadius: '8px',
          border: '1px solid #fecaca',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          color: '#991b1b'
        }}
        role="alert"
      >
        <AlertCircle size={20} color="#dc2626" />
        <div>
          <strong style={{ fontSize: '0.9rem', display: 'block' }}>
            Não foi possível carregar os workflows deste contrato
          </strong>
          <span style={{ fontSize: '0.8rem', color: '#b91c1c' }}>
            Ocorreu uma inconsistência ao processar os dados operacionais.
          </span>
        </div>
      </div>
    );
  }

  // 3. Estado Vazio (Empty State)
  if (!workflows || workflows.length === 0) {
    return (
      <div
        style={{
          padding: '2.5rem 1.5rem',
          backgroundColor: '#f8fafc',
          borderRadius: '8px',
          border: '1px dashed #cbd5e1',
          textAlign: 'center'
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            backgroundColor: '#e2e8f0',
            color: '#64748b',
            marginBottom: '0.75rem'
          }}
        >
          <GitBranch size={22} />
        </div>
        <h4
          style={{
            fontSize: '0.95rem',
            fontWeight: 700,
            color: '#1e293b',
            margin: '0 0 0.35rem 0'
          }}
        >
          Nenhum workflow operacional em andamento
        </h4>
        <p
          style={{
            fontSize: '0.82rem',
            color: '#64748b',
            maxWidth: '560px',
            margin: '0 auto',
            lineHeight: 1.45
          }}
        >
          Os processos de Prorrogação (a 180 dias do término da vigência), Alterações Contratuais,
          Apostilamentos ou Encerramento aparecerão aqui automaticamente conforme seus respectivos marcos
          temporais e planos operacionais.
        </p>
      </div>
    );
  }

  // 4. Exibição da Lista de Workflows Operacionais
  return (
    <div>
      {/* Resumo da Seção */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          gap: '0.5rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
            {workflows.length} {workflows.length === 1 ? 'workflow identificado' : 'workflows identificados'}
          </span>
          {activeCount > 0 && (
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#1d4ed8',
                backgroundColor: '#eff6ff',
                padding: '0.15rem 0.5rem',
                borderRadius: '999px',
                border: '1px solid #bfdbfe'
              }}
            >
              {activeCount} em andamento
            </span>
          )}
          {completedCount > 0 && (
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#047857',
                backgroundColor: '#ecfdf5',
                padding: '0.15rem 0.5rem',
                borderRadius: '999px',
                border: '1px solid #a7f3d0'
              }}
            >
              {completedCount} concluído(s)
            </span>
          )}
        </div>
      </div>

      {/* Lista de Cards de Workflows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {workflows.map(wf => (
          <ContractWorkflowCard key={wf.id} workflow={wf} />
        ))}
      </div>
    </div>
  );
};
