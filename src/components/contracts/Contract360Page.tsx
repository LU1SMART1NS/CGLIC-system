import React from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  DollarSign,
  History,
  ListTodo,
  Receipt
} from 'lucide-react';
import { useContract } from '../../hooks/useContract';
import { InstrumentPageState } from '../instrument360/InstrumentPageState';
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
import { UASG_LINK_LEGADO } from '../../config/unidadesGestoras';

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
  // usa a do prefixo da chave (ex.: 200330-00065-2021) em vez de assumir uma UASG fixa.
  const uasgFromKey = /^(\d{6})-/.exec((contractKey || '').trim())?.[1];
  const uasg = uasgProp || uasgFromKey || UASG_LINK_LEGADO;

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

  // 1. Carregamento, erro, não encontrado e acesso
  if (isLoading) {
    return (
      <InstrumentPageState
        kind="loading"
        title="Carregando Visão 360° do Contrato..."
        message="Sincronizando dados administrativos e status oficiais das bases governamentais."
      />
    );
  }

  if (isError) {
    return (
      <InstrumentPageState
        kind="error"
        title="Falha ao carregar contrato"
        message={error instanceof Error ? error.message : 'Não foi possível recuperar as informações do contrato.'}
        onRetry={() => refetch()}
        backLabel="Voltar para Contratos"
        onBack={() => navigate('/contratos')}
      />
    );
  }

  if (!contract) {
    return (
      <InstrumentPageState
        kind="notFound"
        title="Contrato não encontrado"
        message={<>A chave de contrato informada (<code>{contractKey || 'N/A'}</code>) não corresponde a nenhum registro ativo na UASG {uasg}.</>}
        backLabel="Voltar para lista de contratos"
        onBack={() => navigate('/contratos')}
      />
    );
  }

  if (isScopedRole && loadingManager) {
    return <InstrumentPageState kind="loading" title="Verificando permissão de acesso..." />;
  }

  if (isScopedRole && !isOwnContract) {
    return (
      <InstrumentPageState
        kind="forbidden"
        title="Acesso não autorizado"
        message="Este contrato não está atribuído a você. Seu perfil de gestor só permite visualizar a Visão 360° dos contratos onde você é o gestor titular."
        backLabel="Voltar para lista de contratos"
        onBack={() => navigate('/contratos')}
      />
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
