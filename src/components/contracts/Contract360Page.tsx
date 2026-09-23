import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  GitBranch,
  History,
  Layers,
  ListTodo,
  Loader2,
  Search
} from 'lucide-react';
import { useContract } from '../../hooks/useContract';
import { useContractTaskPlan } from '../../hooks/useContractTaskPlan';
import { getContractManagementKey } from '../../services/contractManagementService';
import { Contract360Header } from './Contract360Header';
import { Contract360Summary } from './Contract360Summary';
import { Contract360Section } from './Contract360Section';
import { ContractAttentionCenter } from './ContractAttentionCenter';
import { ContractWorkflowsSection } from './ContractWorkflowsSection';
import { ContractTasksSection } from './ContractTasksSection';
import { ContractEventsTimeline } from './ContractEventsTimeline';

interface Contract360PageProps {
  contractKeyOverride?: string;
  uasg?: string;
}

export const Contract360Page: React.FC<Contract360PageProps> = ({
  contractKeyOverride,
  uasg = '200331'
}) => {
  const { contractKey: paramContractKey } = useParams<{ contractKey: string }>();
  const navigate = useNavigate();
  const contractKey = contractKeyOverride || paramContractKey;

  const { contract, isLoading, isError, error, refetch } = useContract(contractKey, uasg);

  const resolvedContractKey = contract
    ? contract.id || getContractManagementKey(contract.uasg, contract.numero, contract.ano)
    : '';

  const { data: plan = null, isLoading: loadingPlan } = useContractTaskPlan(
    resolvedContractKey,
    Boolean(contract && resolvedContractKey)
  );

  // 1. Estado de Carregamento
  if (isLoading) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '2.5rem',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
          }}
        >
          <Loader2
            size={36}
            style={{ animation: 'spin 1s linear infinite', color: '#0c326f', margin: '0 auto 1rem auto' }}
          />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
            Carregando Visão 360° do Contrato...
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
            Sincronizando dados administrativos e status oficiais das bases governamentais.
          </p>
        </div>
      </div>
    );
  }

  // 2. Estado de Erro
  if (isError) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
        <div
          style={{
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid #fecaca',
            padding: '2.5rem',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem auto'
            }}
          >
            <AlertCircle size={24} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#991b1b', margin: '0 0 0.5rem 0' }}>
            Falha ao carregar contrato
          </h2>
          <p style={{ fontSize: '0.88rem', color: '#64748b', maxWidth: '500px', margin: '0 auto 1.5rem auto' }}>
            {error instanceof Error ? error.message : 'Não foi possível recuperar as informações do contrato.'}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => refetch()}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#0c326f',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => navigate('/contratos')}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#f8fafc',
                color: '#334155',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              Voltar para Contratos
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Estado de Contrato Não Encontrado
  if (!contract) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '3rem 2rem',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              backgroundColor: '#f1f5f9',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem auto'
            }}
          >
            <Search size={26} />
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
            Contrato não encontrado
          </h2>
          <p style={{ fontSize: '0.9rem', color: '#64748b', maxWidth: '550px', margin: '0 auto 1.75rem auto' }}>
            A chave de contrato informada (<code style={{ backgroundColor: '#f1f5f9', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>{contractKey || 'N/A'}</code>) não corresponde a nenhum registro ativo na UASG {uasg}.
          </p>
          <button
            type="button"
            onClick={() => navigate('/contratos')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 1.25rem',
              backgroundColor: '#0c326f',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer'
            }}
          >
            <ArrowLeft size={16} /> Voltar para lista de contratos
          </button>
        </div>
      </div>
    );
  }

  // 4. Visualização 360° do Contrato (Fase 5.2)
  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Header Executivo com dados de identificação, vigência, valor e status oficial */}
      <Contract360Header contract={contract} />

      {/* Bloco 1: Central de Atenção ("O que precisa da minha atenção?") */}
      <Contract360Section
        id="contract-attention-section"
        title="O que precisa da minha atenção?"
        subtitle="Pendências impeditivas, prazos do motor temporal e confirmações oficiais aguardadas"
        icon={AlertTriangle}
      >
        <ContractAttentionCenter
          contract={contract}
          plan={plan}
          isLoading={loadingPlan}
        />
      </Contract360Section>

      {/* Bloco 2: Workflows Operacionais */}
      <Contract360Section
        id="contract-workflows-section"
        title="Workflows do Contrato"
        subtitle="Instrução e acompanhamento de Prorrogações (4.2), Alterações/Apostilamentos (4.3B) e Rescisões (4.4C)"
        icon={GitBranch}
      >
        <ContractWorkflowsSection
          contract={contract}
          plan={plan}
          isLoading={loadingPlan}
        />
      </Contract360Section>

      {/* Bloco 3: Tarefas e Providências */}
      <Contract360Section
        id="contract-tasks-section"
        title="Tarefas e Providências"
        subtitle="Acompanhamento dinâmico com semântica de execução (INTERNA, EXTERNA, CONFIRMAÇÃO)"
        icon={ListTodo}
      >
        <ContractTasksSection
          contract={contract}
          plan={plan}
          isLoading={loadingPlan}
        />
      </Contract360Section>

      {/* Bloco 4: Linha do Tempo Contratual */}
      <Contract360Section
        id="contract-timeline-section"
        title="Linha do Tempo Contratual"
        subtitle="Histórico formal de eventos imutáveis com distinção entre Fato Oficial, Decisão Interna e Proposta"
        icon={History}
      >
        <ContractEventsTimeline contract={contract} />
      </Contract360Section>

      {/* Bloco 5: Dados Cadastrais e Administrativos */}
      <Contract360Summary contract={contract} />

      {/* Bloco 6: Informações Complementares */}
      <Contract360Section
        id="contract-complementary-section"
        title="Informações Complementares"
        subtitle="Detalhamento técnico de Itens Contratados, Empenhos Vinculados, Processo SEI e Auditoria"
        icon={Layers}
        badge={{ text: 'Fase 5.5', variant: 'neutral' }}
      >
        <div
          style={{
            padding: '1.5rem',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px dashed #cbd5e1',
            textAlign: 'center',
            color: '#475569'
          }}
        >
          <p style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.35rem 0' }}>
            Abas de itens, empenhos e processo SEI serão unificadas nesta seção na Fase 5.5.
          </p>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
            Todos os dados já disponíveis na visualização clássica serão incorporados sem duplicidade.
          </p>
        </div>
      </Contract360Section>
    </div>
  );
};
