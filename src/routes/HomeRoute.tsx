import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { ImmediateAttentionBanner } from '../components/home/ImmediateAttentionBanner';
import { DashboardExecutiveSummary } from '../components/home/DashboardExecutiveSummary';
import { ActionableAttentionCenter } from '../components/home/ActionableAttentionCenter';
import { LifecycleFlowDiagram } from '../components/home/LifecycleFlowDiagram';
import { QuickAccessGrid } from '../components/home/QuickAccessGrid';
import { SyncActivityCard } from '../components/home/SyncActivityCard';
import { useHomeDashboardData } from '../hooks/useHomeDashboardData';
import { useCentralPrazosData } from '../hooks/useCentralPrazosData';
import type { AppShellContextValue } from '../components/layout/AppShell';

export const HomeRoute: React.FC = () => {
  const context = useOutletContext<AppShellContextValue | null>();

  // 1. Dados consolidados de contratos, atas e sincronização oficial
  const {
    totalArps,
    activeArps,
    totalContracts,
    activeContracts,
    expiringContractsCount,
    totalContractValue,
    expiringContracts,
    syncInfo,
    isLoading: loadingHome,
    refetch: refetchHome
  } = useHomeDashboardData('200331');

  // 2. Dados canônicos da Central de Prazos e Tarefas
  const {
    items: centralItems,
    kpis: centralKpis,
    isLoading: loadingCentral,
    refetch: refetchCentral
  } = useCentralPrazosData('200331');

  const todayFormatted = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const handleRefresh = () => {
    refetchHome();
    refetchCentral();
  };

  const isLoading = loadingHome || loadingCentral;

  return (
    <div style={{
      maxWidth: '1600px',
      margin: '0 auto',
      padding: '2rem 2.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '2rem'
    }}>
      {/* 1. Cabeçalho do Centro de Comando / Visão Geral */}
      <header style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '1.75rem 2rem',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1.25rem',
        borderLeft: '5px solid #0c326f'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#0c326f',
              background: '#eff6ff',
              padding: '0.2rem 0.6rem',
              borderRadius: '999px'
            }}>
              Cockpit Gerencial
            </span>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
              • {todayFormatted}
            </span>
          </div>

          <h1 style={{
            fontSize: '1.6rem',
            fontWeight: 800,
            color: '#0f172a',
            margin: 0,
            letterSpacing: '-0.02em',
            paddingBottom: 0,
            borderBottom: 'none'
          }}>
            Centro de Comando Executivo — ComprasSUSP
          </h1>

          <p style={{ fontSize: '0.86rem', color: '#475569', margin: '0.35rem 0 0 0', fontWeight: 500 }}>
            Secretaria Nacional de Segurança Pública — SENASP | Gestão CGLIC • <strong>UASG 200331</strong>
          </p>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '0.65rem 1rem',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>Perfil Ativo</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a' }}>Gestor / Operador</span>
          </div>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: '#0c326f',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '0.88rem'
          }}>
            MJ
          </div>
        </div>
      </header>

      {/* 2. Atenção Imediata (Top Banner com 4 cards acionáveis da Central de Prazos) */}
      <ImmediateAttentionBanner
        kpis={centralKpis}
        loading={isLoading}
      />

      {/* 3. Resumo Operacional e Financeiro */}
      <DashboardExecutiveSummary
        totalArps={totalArps}
        activeArps={activeArps}
        totalContracts={totalContracts}
        activeContracts={activeContracts}
        expiringContractsCount={expiringContractsCount}
        totalContractValue={totalContractValue}
        loading={isLoading}
      />

      {/* 4. Ações Prioritárias do Setor (Prazos mais críticos da Central) */}
      <ActionableAttentionCenter
        items={centralItems}
        expiringContracts={expiringContracts}
        loading={isLoading}
      />

      {/* 5. Ciclo de Gestão Governamental */}
      <LifecycleFlowDiagram
        totalArps={totalArps}
        totalContracts={totalContracts}
        loading={isLoading}
      />

      {/* 6. Acesso Rápido */}
      <QuickAccessGrid
        onOpenExportModal={context?.onOpenExportModal}
        onOpenContractTemplatesModal={context?.onOpenContractTemplatesModal}
        onOpenSeiModal={context?.onOpenSeiModal}
        onOpenDepartmentsModal={context?.onOpenDepartmentsModal}
      />

      {/* 7. Integração & Fontes Oficiais */}
      <SyncActivityCard
        syncInfo={syncInfo}
        uasg="200331"
        onRefresh={handleRefresh}
      />
    </div>
  );
};
