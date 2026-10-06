import React from 'react';
import { useParams } from 'react-router-dom';
import { useBackTarget } from '../../hooks/useDetailOrigin';
import {
  AlertTriangle,
  DollarSign,
  History,
  ListTodo,
  Package,
  Receipt
} from 'lucide-react';
import { useContract } from '../../hooks/useContract';
import { InstrumentPageState } from '../instrument360/InstrumentPageState';
import { useContractTaskPlan } from '../../hooks/useContractTaskPlan';
import { useAssignedManagementScope } from '../../hooks/useAssignedManagementScope';
import { useAuth } from '../../context/AuthContext';
import { getContractManagementKey } from '../../services/contractManagementService';
import { Contract360Header } from './Contract360Header';
import { InstrumentSection } from '../instrument360/InstrumentSection';
import { Instrument360Page } from '../instrument360/Instrument360Page';
import { Instrument360TabPanel } from '../instrument360/Instrument360TabPanel';
import { useInstrumentTab } from '../instrument360/useInstrumentTab';
import { ContractActionQueue, type Contract360Tab } from './ContractActionQueue';
import { ContractHealthStrip } from './ContractHealthStrip';
import { useContractActionQueue } from '../../hooks/useContractActionQueue';
import { ContractPaymentFollowUpSection } from './ContractPaymentFollowUpSection';
import { ContractFinancialExecutionSection } from './ContractFinancialExecutionSection';
import { ContractTasksSection } from './ContractTasksSection';
import { ContractEventsTimeline } from './ContractEventsTimeline';
import { ContractItemsSection } from './ContractItemsSection';
import { useItensDoContrato } from '../../hooks/useItensDoContrato';
import { Instrument360Tabs } from '../instrument360/Instrument360Tabs';
import { UASG_LINK_LEGADO } from '../../config/unidadesGestoras';

const TAB_IDS: Contract360Tab[] = ['acoes', 'plano', 'itens', 'financeiro', 'pagamentos', 'historico'];

interface Contract360PageProps {
  contractKeyOverride?: string;
  uasg?: string;
}

export const Contract360Page: React.FC<Contract360PageProps> = ({
  contractKeyOverride,
  uasg: uasgProp
}) => {
  const { contractKey: paramContractKey } = useParams<{ contractKey: string }>();
  const back = useBackTarget({ path: '/contratos', label: 'Voltar para Contratos' });
  const contractKey = contractKeyOverride || paramContractKey;

  // A chave canônica é "UASG-NUMERO-ANO": quando a UASG não é informada por prop,
  // usa a do prefixo da chave (ex.: 200330-00065-2021) em vez de assumir uma UASG fixa.
  const uasgFromKey = /^(\d{6})-/.exec((contractKey || '').trim())?.[1];
  const uasg = uasgProp || uasgFromKey || UASG_LINK_LEGADO;

  const { contract, enriching, isLoading, isError, error, refetch } = useContract(contractKey, uasg);

  const resolvedContractKey = contract
    ? contract.id || getContractManagementKey(contract.uasg, contract.numero, contract.ano)
    : '';

  const { data: plan = null, isLoading: loadingPlan } = useContractTaskPlan(
    resolvedContractKey,
    Boolean(contract && resolvedContractKey)
  );

  const { queue, isLoading: loadingQueue } = useContractActionQueue(contract, plan);

  // Itens do contrato: lidos do banco (a sincronização grava), com o vínculo de cada um à ata.
  const itensDoContrato = useItensDoContrato(resolvedContractKey, Boolean(contract));
  const totalItens = itensDoContrato.data?.itens.length ?? 0;

  const { activeTab, goToTab, tabsRef } = useInstrumentTab<Contract360Tab>({ tabs: TAB_IDS, defaultTab: 'acoes' });

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
        backLabel={back.label}
        onBack={back.back}
      />
    );
  }

  if (!contract) {
    return (
      <InstrumentPageState
        kind="notFound"
        title="Contrato não encontrado"
        message={<>A chave de contrato informada (<code>{contractKey || 'N/A'}</code>) não corresponde a nenhum registro ativo na UASG {uasg}.</>}
        backLabel={back.label}
        onBack={back.back}
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
        backLabel={back.label}
        onBack={back.back}
      />
    );
  }

  const tabs: { id: Contract360Tab; label: string }[] = [
    { id: 'acoes', label: queue.items.length > 0 ? `Ações (${queue.items.length})` : 'Ações' },
    { id: 'plano', label: 'Plano de gestão' },
    { id: 'itens', label: totalItens > 0 ? `Itens (${totalItens})` : 'Itens' },
    { id: 'financeiro', label: 'Orçamentário' },
    { id: 'pagamentos', label: 'Pagamentos' },
    { id: 'historico', label: 'Histórico' }
  ];

  return (
    <Instrument360Page>
      <Contract360Header contract={contract} loadingOfficial={enriching}>
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
        onSelect={(tab) => goToTab(tab)}
        idPrefix="contract"
        ariaLabel="Seções do contrato"
      />

      <Instrument360TabPanel idPrefix="contract" activeTab={activeTab}>
        {activeTab === 'acoes' && (
          <InstrumentSection
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
              onGoTo={(tab) => goToTab(tab)}
            />
          </InstrumentSection>
        )}

        {activeTab === 'plano' && (
          <InstrumentSection
            id="contract-tasks-section"
            title="Plano de gestão"
            subtitle="Todas as tarefas do modelo de gestão aplicado, com responsável, prazo e situação"
            icon={ListTodo}
          >
            <ContractTasksSection contract={contract} plan={plan} isLoading={loadingPlan} />
          </InstrumentSection>
        )}

        {activeTab === 'itens' && (
          <InstrumentSection
            id="contract-items-section"
            title="Itens do contrato"
            subtitle="Itens como a fonte oficial informa, com o item da ata a que cada um está vinculado"
            icon={Package}
          >
            <ContractItemsSection
              dados={itensDoContrato.data}
              isLoading={itensDoContrato.isLoading}
              error={itensDoContrato.error}
              onRetry={() => void itensDoContrato.refetch()}
            />
          </InstrumentSection>
        )}

        {activeTab === 'pagamentos' && (
          <InstrumentSection
            id="contract-payment-followup-section"
            title="Acompanhamento de pagamentos"
            subtitle="Atestos, faturamento e tramitação na CGOFI (o CGLIC acompanha; a CGOFI executa o pagamento)"
            icon={DollarSign}
          >
            <ContractPaymentFollowUpSection contract={contract} contractKey={resolvedContractKey} />
          </InstrumentSection>
        )}

        {activeTab === 'financeiro' && (
          <InstrumentSection
            id="contract-financial-execution-section"
            title="Execução financeira e empenhos"
            subtitle="Empenhos emitidos, liquidação, pagamento e saldos de execução"
            icon={Receipt}
          >
            <ContractFinancialExecutionSection contract={contract} contractKey={resolvedContractKey} />
          </InstrumentSection>
        )}

        {activeTab === 'historico' && (
          <InstrumentSection
            id="contract-timeline-section"
            title="Linha do tempo contratual"
            subtitle="Histórico de eventos, separando fato oficial, decisão interna e proposta"
            icon={History}
          >
            <ContractEventsTimeline contract={contract} />
          </InstrumentSection>
        )}
      </Instrument360TabPanel>
    </Instrument360Page>
  );
};
