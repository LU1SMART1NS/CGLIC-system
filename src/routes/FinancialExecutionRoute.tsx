import React, { useState } from 'react';
import { PageContainer } from '../design-system/components/PageContainer';
import { useNavigateWithOrigin } from '../hooks/useDetailOrigin';
import { Banknote } from 'lucide-react';
import { ManagementFinancialExecution } from '../components/dashboard/ManagementFinancialExecution';
import { useManagementDashboard } from '../hooks/useManagementDashboard';
import { useAssignedManagementScope } from '../hooks/useAssignedManagementScope';
import { useSincronizacaoEmpenhos } from '../hooks/useSincronizacaoEmpenhos';
import { PageHeader } from '../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../design-system/components/HeaderRefreshAction';
import { Tabs } from '../design-system/components/Tabs';
import { UASGS_CGLIC } from '../config/unidadesGestoras';

export const FinancialExecutionRoute: React.FC = () => {
  const navigate = useNavigateWithOrigin();

  // Perfil "gestor" tem escopo ASSIGNED em contratos (role_domain_scopes,
  // migration 20260925000023), agora derivado também das Atas atribuídas
  // (ata_managers): mesmo recorte aplicado em ContractsRoute.tsx e na Visão
  // Geral, agora também na execução financeira agregada aqui.
  // Painel de uma UASG por vez: somar os dois contaria duas vezes o empenho emitido por uma UASG e
  // ligado a contrato da outra (o recorte por UASG mantém os dois casos).
  const [uasg, setUasg] = useState<string>('200331');
  const { contractKeys: assignedContractKeys, ataKeys: assignedAtaKeys, isLoading: isLoadingManagers } =
    useAssignedManagementScope(uasg);

  const { readModel, isLoading: isLoadingDashboard, isFetching, isError, error, refresh, dataUpdatedAt } =
    useManagementDashboard({ uasg, assignedContractKeys, assignedAtaKeys });
  const isLoading = isLoadingDashboard || isLoadingManagers;
  // Só o coordenador atualiza com as fontes oficiais; os demais perfis leem o banco, que o servidor mantém em dia.
  const sincronizacao = useSincronizacaoEmpenhos();

  const handleNavigateContract = (contractKey: string) => {
    navigate(`/contratos/${encodeURIComponent(contractKey)}`);
  };

  return (
    <PageContainer>
      {/* Header da Página Canônico */}
      <PageHeader
        title="Empenhos"
        subtitle="Execução oficial dos empenhos, liquidações e pagamentos."
        icon={<Banknote size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <HeaderRefreshAction
            onRefresh={sincronizacao.podeForcar ? () => void sincronizacao.atualizar() : undefined}
            isRefreshing={sincronizacao.sincronizando || isFetching}
            lastUpdated={sincronizacao.ultimoSucessoEm ?? dataUpdatedAt}
            tooltipTitle={
              sincronizacao.podeForcar
                ? 'Atualizar os empenhos com o Contratos.gov.br'
                : 'Os empenhos são atualizados automaticamente pelo servidor, de hora em hora'
            }
            dataTestId="financial-execution-refresh-btn"
          />
        }
      />

      <Tabs
        tabs={UASGS_CGLIC.slice().reverse().map((u) => ({ id: u, label: `UASG ${u}` }))}
        activeTabId={uasg}
        onTabChange={setUasg}
        ariaLabel="UASG exibida no painel"
        testId="financial-execution-uasg-tabs"
      />

      <ManagementFinancialExecution
        readModel={readModel}
        isLoading={isLoading}
        isError={isError}
        errorMessage={error?.message}
        onNavigateContract={handleNavigateContract}
        onRefresh={() => refresh()}
      />
    </PageContainer>
  );
};
