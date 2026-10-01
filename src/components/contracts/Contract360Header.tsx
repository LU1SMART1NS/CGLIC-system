import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ExternalLink,
  FileText,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Info,
  XCircle,
  X
} from 'lucide-react';
import type { ContractDashboardRecord } from '../../types';
import { useSyncContractEmpenhos } from '../../hooks/useSyncContractEmpenhos';
import type { OrchestrationStatus } from '../../types/empenhoSync';
import { useContractManager } from '../../hooks/useContractManager';
import { ManagerInfo } from '../instrument360/ManagerInfo';
import { getContractDaysRemaining } from '../../services/dashboardService';
import { formatContractNumber } from '../../utils/contractNumber';
import { classifyPrazo } from '../carteira/carteiraPrazo';
import { Instrument360Hero, instrumentStatusLabel } from '../instrument360/Instrument360Hero';

interface Contract360HeaderProps {
  contract: ContractDashboardRecord;
  onBack?: () => void;
  userRole?: string;
  canSync?: boolean;
  /** Indicadores e linha da vida (ContractHealthStrip), dentro do mesmo cartão. */
  children?: React.ReactNode;
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

export const Contract360Header: React.FC<Contract360HeaderProps> = ({
  contract,
  onBack,
  userRole,
  canSync,
  children
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/contratos');
    }
  };

  const contractKey =
    contract.id ||
    (contract.uasg && contract.numero && contract.ano
      ? `${contract.uasg}-${contract.numero}-${contract.ano}`
      : contract.numeroControlePncp || 'unknown-contract');

  const syncMutation = useSyncContractEmpenhos(contractKey);
  const { data: manager, isLoading: loadingManager } = useContractManager(contractKey);

  // RBAC: gestor, coordenador e admin possuem permissão
  const isAuthorized =
    userRole !== undefined
      ? ['gestor', 'coordenador', 'admin'].includes(userRole)
      : canSync !== undefined
      ? canSync
      : true;

  const handleSync = () => {
    if (!isAuthorized || syncMutation.isPending) return;
    const pncpParams =
      contract.codigoOrgao && contract.ano && contract.numero
        ? {
            cnpj: contract.codigoOrgao,
            ano: contract.ano,
            sequencialContrato: contract.numero
          }
        : undefined;

    syncMutation.mutate({
      contratoId: contract.contratoId || contract.id,
      pncpParams
    });
  };

  const pncpUrl =
    contract.linkPncp ||
    (contract.numeroControlePncp
      ? `https://pncp.gov.br/app/contratos/${contract.numeroControlePncp}`
      : undefined);

  // Mapeamento de Feedback Operacional
  const getFeedbackConfig = (status?: OrchestrationStatus) => {
    switch (status) {
      case 'SUCESSO':
        return {
          bg: '#f0fdf4',
          border: '#bbf7d0',
          color: '#166534',
          icon: <CheckCircle2 size={16} color="#166534" />,
          message: `Sincronização concluída. ${
            syncMutation.data?.empenhos_persistidos ?? syncMutation.data?.empenhos_encontrados ?? 0
          } empenho(s) processado(s) e atualizado(s) com sucesso.`
        };
      case 'SEM_DADOS':
        return {
          bg: '#f0f9ff',
          border: '#bae6fd',
          color: '#075985',
          icon: <Info size={16} color="#075985" />,
          message: 'Nenhum empenho encontrado nas bases oficiais para este contrato.'
        };
      case 'SUCESSO_PARCIAL':
        return {
          bg: '#fffbeb',
          border: '#fde68a',
          color: '#92400e',
          icon: <AlertTriangle size={16} color="#92400e" />,
          message: 'Sincronização concluída parcialmente. Algumas bases externas estavam temporariamente indisponíveis.'
        };
      case 'COM_DIVERGENCIAS':
        return {
          bg: '#fffbeb',
          border: '#fde68a',
          color: '#92400e',
          icon: <AlertTriangle size={16} color="#92400e" />,
          message: `Dados sincronizados com ${syncMutation.data?.divergencias?.length ?? 0} divergência(s) entre fontes oficiais. Detalhes registrados no histórico.`
        };
      case 'ERRO':
      default:
        return {
          bg: '#fef2f2',
          border: '#fecaca',
          color: '#991b1b',
          icon: <XCircle size={16} color="#991b1b" />,
          message:
            syncMutation.data?.erros?.[0]?.erro ||
            (syncMutation.error instanceof Error
              ? syncMutation.error.message
              : 'Não foi possível consultar as bases governamentais no momento. Tente novamente mais tarde.')
        };
    }
  };

  const showFeedback = Boolean(syncMutation.data || syncMutation.isError);
  const feedback = showFeedback
    ? getFeedbackConfig(syncMutation.data?.status || (syncMutation.isError ? 'ERRO' : undefined))
    : null;

  const dias = getContractDaysRemaining(contract.dataVigenciaFim);
  const faixa = classifyPrazo(dias, contract.statusVigencia === 'Expirado');
  const numDisplay = formatContractNumber(contract);

  return (
    <Instrument360Hero
      backLabel="Voltar para Contratos"
      onBack={handleBack}
      actions={
        <>
          {/* Empenhos de contrato não são atualizados automaticamente: este é o único
              gatilho por contrato (o lote fica em Execução Financeira). */}
          <button
            type="button"
            aria-label="Atualizar empenhos"
            disabled={!isAuthorized || syncMutation.isPending}
            onClick={handleSync}
            title={
              !isAuthorized
                ? 'Você não possui permissão para atualizar empenhos.'
                : `Buscar empenhos deste contrato nas fontes oficiais (fonte do contrato: ${contract.fonteDados || 'PNCP'})`
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: !isAuthorized ? '#94a3b8' : '#0c326f',
              backgroundColor: !isAuthorized ? '#f1f5f9' : '#f0fdf4',
              padding: '0.25rem 0.65rem',
              borderRadius: '6px',
              border: `1px solid ${!isAuthorized ? '#cbd5e1' : '#86efac'}`,
              cursor: !isAuthorized || syncMutation.isPending ? 'not-allowed' : 'pointer'
            }}
          >
            {syncMutation.isPending ? (
              <>
                <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                <span>Atualizando...</span>
              </>
            ) : (
              <>
                <RefreshCw size={13} />
                <span>Atualizar empenhos</span>
              </>
            )}
          </button>

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
                textDecoration: 'none'
              }}
            >
              <ExternalLink size={13} /> Contrato no PNCP
            </a>
          )}
        </>
      }
      notice={
        showFeedback && feedback ? (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              padding: '0.6rem 0.85rem',
              marginBottom: '1rem',
              borderRadius: '8px',
              background: feedback.bg,
              border: `1px solid ${feedback.border}`,
              color: feedback.color,
              fontSize: '0.82rem',
              fontWeight: 600
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {feedback.icon}
              <span>{feedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => syncMutation.reset()}
              aria-label="Fechar notificação"
              style={{ background: 'none', border: 'none', color: feedback.color, cursor: 'pointer', display: 'flex', opacity: 0.75 }}
            >
              <X size={14} />
            </button>
          </div>
        ) : null
      }
      icon={<FileText size={26} color="#0c326f" aria-hidden="true" />}
      title={`Contrato ${numDisplay}`}
      status={{ faixa, label: instrumentStatusLabel(faixa, dias) }}
      manager={<ManagerInfo label="Gestor titular" gestorNome={manager?.gestorNome} isLoading={loadingManager} testId="contract-manager-info" />}
      objeto={contract.objeto}
      metaTestId="contract-header-metadata"
      meta={[
        { label: 'Processo', value: contract.processo },
        { label: 'Órgão', value: contract.nomeOrgao },
        ...(contract.nomeUnidadeGestora && contract.nomeUnidadeGestora.trim().toUpperCase() !== (contract.nomeOrgao || '').trim().toUpperCase()
          ? [{ label: 'Unidade gestora', value: `${contract.nomeUnidadeGestora} (${contract.uasg})` }]
          : [{ label: 'UASG', value: contract.uasg }]),
        { label: 'Modalidade', value: contract.modalidadeCompra },
        { label: 'Nº PNCP', value: contract.numeroControlePncp },
        { label: 'Assinatura', value: contract.dataAssinatura ? formatDateBR(contract.dataAssinatura) : undefined }
      ]}
    >
      {children}
    </Instrument360Hero>
  );
};
