import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, FileText, RefreshCw } from 'lucide-react';
import type { ContractDashboardRecord } from '../../types';
import { useSyncContractEmpenhos } from '../../hooks/useSyncContractEmpenhos';
import { useAuth } from '../../context/AuthContext';
import type { OrchestrationStatus } from '../../types/empenhoSync';
import { useContractManager } from '../../hooks/useContractManager';
import { ManagerInfo } from '../instrument360/ManagerInfo';
import { getContractDaysRemaining } from '../../services/dashboardService';
import { formatContractNumber } from '../../utils/contractNumber';
import { classifyPrazo } from '../carteira/carteiraPrazo';
import { AppButton, NoticeBar, type NoticeBarTone } from '../../design-system';
import { pncpLinkStyle } from '../atas/Ata360Header';
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
  // Itens da ata são gravados por RPCs de gestor/admin: só esses perfis refazem a parte dos itens.
  const { role } = useAuth();
  const canRefreshItems = role === 'gestor' || role === 'admin';
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
      pncpParams,
      refreshItems: canRefreshItems ? contract : undefined
    });
  };

  const pncpUrl =
    contract.linkPncp ||
    (contract.numeroControlePncp
      ? `https://pncp.gov.br/app/contratos/${contract.numeroControlePncp}`
      : undefined);

  // Resumo da parte dos itens da ata (só quando o perfil refaz os itens e há itens ligados)
  const itensRefresh = syncMutation.data?.itens_refresh;
  const itensResumo = (() => {
    if (!itensRefresh || (itensRefresh.itens === 0 && itensRefresh.falhas.length === 0)) return '';
    const ok = itensRefresh.itens - itensRefresh.falhas.length;
    const partes = [`${ok} ${ok === 1 ? 'item da ata atualizado' : 'itens da ata atualizados'}`];
    if (itensRefresh.pendentes > 0) {
      partes.push(`${itensRefresh.pendentes} ${itensRefresh.pendentes === 1 ? 'quantidade pendente' : 'quantidades pendentes'} de confirmação`);
    }
    if (itensRefresh.falhas.length > 0) {
      partes.push(`${itensRefresh.falhas.length} ${itensRefresh.falhas.length === 1 ? 'item não pôde ser atualizado' : 'itens não puderam ser atualizados'}`);
    }
    return ` ${partes.join(' · ')}.`;
  })();

  // Feedback operacional da sincronização de empenhos
  const getFeedbackConfig = (status?: OrchestrationStatus): { tone: NoticeBarTone; message: string } => {
    switch (status) {
      case 'SUCESSO':
        return {
          tone: itensRefresh && itensRefresh.falhas.length > 0 ? 'warning' : 'success',
          message: `Sincronização concluída. ${
            syncMutation.data?.empenhos_persistidos ?? syncMutation.data?.empenhos_encontrados ?? 0
          } empenho(s) processado(s) e atualizado(s) com sucesso.${itensResumo}`
        };
      case 'SEM_DADOS':
        return { tone: 'info', message: `Nenhum empenho encontrado nas bases oficiais para este contrato.${itensResumo}` };
      case 'SUCESSO_PARCIAL':
        return { tone: 'warning', message: `Sincronização concluída parcialmente. Algumas bases externas estavam temporariamente indisponíveis.${itensResumo}` };
      case 'COM_DIVERGENCIAS':
        return {
          tone: 'warning',
          message: `Dados sincronizados com ${syncMutation.data?.divergencias?.length ?? 0} divergência(s) entre fontes oficiais. Detalhes registrados no histórico.${itensResumo}`
        };
      case 'ERRO':
      default:
        return {
          tone: 'danger',
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
          {pncpUrl && (
            <a href={pncpUrl} target="_blank" rel="noopener noreferrer" style={pncpLinkStyle}>
              <ExternalLink size={13} /> Contrato no PNCP
            </a>
          )}
          {/* Empenhos de contrato não são atualizados automaticamente: este é o único
              gatilho por contrato (o lote fica em Execução Financeira). */}
          <AppButton
            variant="outline"
            size="sm"
            icon={<RefreshCw size={14} className={syncMutation.isPending ? 'spin-animation' : ''} />}
            onClick={handleSync}
            disabled={!isAuthorized || syncMutation.isPending}
            isLoading={syncMutation.isPending}
            title={
              !isAuthorized
                ? 'Você não possui permissão para atualizar empenhos.'
                : `Buscar empenhos deste contrato nas fontes oficiais (fonte do contrato: ${contract.fonteDados || 'PNCP'})`
            }
          >
            {syncMutation.isPending ? 'Atualizando...' : 'Atualizar empenhos'}
          </AppButton>
        </>
      }
      notice={
        showFeedback && feedback ? (
          <NoticeBar tone={feedback.tone} testId="contract-sync-feedback" onDismiss={() => syncMutation.reset()}>
            {feedback.message}
          </NoticeBar>
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
