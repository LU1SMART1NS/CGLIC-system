import React from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  DollarSign,
  History,
  ListTodo,
  Loader2,
  Receipt,
  Search
} from 'lucide-react';
import { useContract } from '../../hooks/useContract';
import { useContractTaskPlan } from '../../hooks/useContractTaskPlan';
import { useAssignedManagementScope } from '../../hooks/useAssignedManagementScope';
import { useAuth } from '../../context/AuthContext';
import { getContractManagementKey } from '../../services/contractManagementService';
import { Contract360Header } from './Contract360Header';
import { Contract360Section } from './Contract360Section';
import { ContractActionQueue, type Contract360Tab } from './ContractActionQueue';
import { ContractHealthStrip } from './ContractHealthStrip';
import { useContractActionQueue } from '../../hooks/useContractActionQueue';
import { ContractPaymentFollowUpSection } from './ContractPaymentFollowUpSection';
import { ContractFinancialExecutionSection } from './ContractFinancialExecutionSection';
import { ContractTasksSection } from './ContractTasksSection';
import { ContractEventsTimeline } from './ContractEventsTimeline';
import { Instrument360Tabs } from '../instrument360/Instrument360Tabs';

const TAB_IDS: Contract360Tab[] = ['acoes', 'plano', 'pagamentos', 'financeiro', 'historico'];

interface Contract360PageProps {
  contractKeyOverride?: string;
  uasg?: string;
}

export const Contract360Page: React.FC<Contract360PageProps> = ({
  contractKeyOverride,
  uasg: uasgProp
}) => {
  const { contractKey: paramContractKey } = useParams<{ contractKey: string }>();
  const navigate = useNavigate();
  const contractKey = contractKeyOverride || paramContractKey;

  // A chave canônica é "UASG-NUMERO-ANO": quando a UASG não é informada por prop,
  // usa a do prefixo da chave (ex.: 200330-00065-2021) em vez de assumir 200331.
  const uasgFromKey = /^(\d{6})-/.exec((contractKey || '').trim())?.[1];
  const uasg = uasgProp || uasgFromKey || '200331';

  const { contract, isLoading, isError, error, refetch } = useContract(contractKey, uasg);

  const resolvedContractKey = contract
    ? contract.id || getContractManagementKey(contract.uasg, contract.numero, contract.ano)
    : '';

  const { data: plan = null, isLoading: loadingPlan } = useContractTaskPlan(
    resolvedContractKey,
    Boolean(contract && resolvedContractKey)
  );

  const { queue, isLoading: loadingQueue } = useContractActionQueue(contract, plan);

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('aba') as Contract360Tab | null;
  const activeTab: Contract360Tab = tabParam && TAB_IDS.includes(tabParam) ? tabParam : 'acoes';
  const tabsRef = React.useRef<HTMLDivElement>(null);
  const goToTab = (tab: Contract360Tab) => {
    setSearchParams(tab === 'acoes' ? {} : { aba: tab });
    tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Escopo ASSIGNED do perfil "gestor" (role_domain_scopes.contracts,
  // migration 20260925000023): a listagem em ContractsRoute.tsx já esconde
  // contratos de outros gestores, mas isso não impede acesso direto por URL
  // (/contratos/:contractKey). Esta guarda fecha essa lacuna de deep-link.
  const { user, role } = useAuth();
  const { contractKeys: assignedContractKeys, isLoading: loadingManager } = useAssignedManagementScope(uasg);
  const isScopedRole = role === 'gestor';
  const isOwnContract = Boolean(
    user && resolvedContractKey && assignedContractKeys?.includes(resolvedContractKey)
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

  // 3.5 Guarda de Escopo (perfil "gestor" — ver comentário acima)
  if (isScopedRole && loadingManager) {
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
            Verificando permissão de acesso...
          </h2>
        </div>
      </div>
    );
  }

  if (isScopedRole && !isOwnContract) {
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
            Acesso não autorizado
          </h2>
          <p style={{ fontSize: '0.88rem', color: '#64748b', maxWidth: '500px', margin: '0 auto 1.5rem auto' }}>
            Este contrato não está atribuído a você. Seu perfil de gestor só permite visualizar a Visão 360° dos contratos onde você é o gestor titular.
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

  const tabs: { id: Contract360Tab; label: string }[] = [
    { id: 'acoes', label: queue.items.length > 0 ? `Ações (${queue.items.length})` : 'Ações' },
    { id: 'plano', label: 'Plano de gestão' },
    { id: 'pagamentos', label: 'Pagamentos' },
    { id: 'financeiro', label: 'Financeiro' },
    { id: 'historico', label: 'Histórico' }
  ];

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
      <Contract360Header contract={contract}>
        <ContractHealthStrip
          contract={contract}
          contractKey={resolvedContractKey}
          counts={queue.counts}
          onOpenActions={() => goToTab('acoes')}
          onOpenFinanceiro={() => goToTab('financeiro')}
        />
      </Contract360Header>

      <Instrument360Tabs
        ref={tabsRef}
        tabs={tabs}
        active={activeTab}
        onSelect={goToTab}
        idPrefix="contract"
        ariaLabel="Seções do contrato"
      />

      <div role="tabpanel" id={`contract-tabpanel-${activeTab}`} aria-labelledby={`contract-tab-${activeTab}`}>
        {activeTab === 'acoes' && (
          <Contract360Section
            id="contract-attention-section"
            title="Ações do contrato"
            subtitle="Tarefas, pagamentos, reajustes e prazos legais em ordem de prioridade"
            icon={AlertTriangle}
          >
            <ContractActionQueue
              queue={queue}
              contractKey={resolvedContractKey}
              plan={plan}
              isLoading={loadingPlan || loadingQueue}
              onGoTo={goToTab}
            />
          </Contract360Section>
        )}

        {activeTab === 'plano' && (
          <Contract360Section
            id="contract-tasks-section"
            title="Plano de gestão"
            subtitle="Todas as tarefas do modelo de gestão aplicado, com responsável, prazo e situação"
            icon={ListTodo}
          >
            <ContractTasksSection contract={contract} plan={plan} isLoading={loadingPlan} />
          </Contract360Section>
        )}

        {activeTab === 'pagamentos' && (
          <Contract360Section
            id="contract-payment-followup-section"
            title="Acompanhamento de pagamentos"
            subtitle="Atestos, faturamento e tramitação na CGOFI (o CGLIC acompanha; a CGOFI executa o pagamento)"
            icon={DollarSign}
          >
            <ContractPaymentFollowUpSection contract={contract} contractKey={resolvedContractKey} />
          </Contract360Section>
        )}

        {activeTab === 'financeiro' && (
          <Contract360Section
            id="contract-financial-execution-section"
            title="Execução financeira e empenhos"
            subtitle="Empenhos emitidos, liquidação, pagamento e saldos de execução"
            icon={Receipt}
          >
            <ContractFinancialExecutionSection contract={contract} contractKey={resolvedContractKey} />
          </Contract360Section>
        )}

        {activeTab === 'historico' && (
          <Contract360Section
            id="contract-timeline-section"
            title="Linha do tempo contratual"
            subtitle="Histórico de eventos, separando fato oficial, decisão interna e proposta"
            icon={History}
          >
            <ContractEventsTimeline contract={contract} />
          </Contract360Section>
        )}
      </div>
    </div>
  );
};
