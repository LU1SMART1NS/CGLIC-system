import React from 'react';
import { useBackTarget, useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { ExternalLink } from 'lucide-react';
import type { ContractDashboardRecord } from '../../types';
import { useSyncContractEmpenhos } from '../../hooks/useSyncContractEmpenhos';
import { mensagemDoResultado, pendenciasPncp, avisoVinculosRemovidos } from '../../services/contratoEmpenhosSincronizacaoService';
import { useAuth } from '../../context/AuthContext';
import type { OrchestrationStatus } from '../../types/empenhoSync';
import { useContractManager } from '../../hooks/useContractManager';
import { ManagerInfo } from '../instrument360/ManagerInfo';
import { MissingValue } from '../instrument360/MissingValue';
import { getContractDaysRemaining } from '../../services/dashboardService';
import { formatContractNumber } from '../../utils/contractNumber';
import { classifyPrazo } from '../carteira/carteiraPrazo';
import { ActionButton, AppButton, NoticeBar, type NoticeBarTone } from '../../design-system';
import { pncpLinkStyle } from '../atas/Ata360Header';
import { Instrument360Hero, instrumentSituationLabel } from '../instrument360/Instrument360Hero';
import { formatCnpj, formatCurrency } from '../../utils/format';
import { formatDateISO } from '../../services/temporalEngineService';
import { useContractResponsaveis } from '../../hooks/useContractResponsaveis';
import { useContractGarantias } from '../../hooks/useContractGarantias';
import { useContractPncp } from '../../hooks/useContractPncp';
import { useAtaPncp } from '../../hooks/useAtaPncp';
import { buildAtaPath } from '../../hooks/useAta';
import { ataDeOrigem } from '../../services/pncpContratoService';
import { isUasgCglic } from '../../config/unidadesGestoras';
import { fiscaisAtivos, garantiaAviso, garantiaMaisLonga, type GarantiaResumo } from '../../services/contractResponsaveisService';
import { chaveDoContrato } from '../../utils/contractKeyUtils';

interface Contract360HeaderProps {
  contract: ContractDashboardRecord;
  onBack?: () => void;
  userRole?: string;
  canSync?: boolean;
  /** Enquanto o contrato é completado com o Contratos.gov.br: não mostra "não informada" antes da hora. */
  loadingOfficial?: boolean;
  /** Indicadores e linha da vida (ContractHealthStrip), dentro do mesmo cartão. */
  children?: React.ReactNode;
}

/** Texto de apoio da garantia: uma linha por garantia, da de vencimento mais longo para a mais curta. */
function garantiaDetalhe(garantia: GarantiaResumo, hoje: string): string {
  return garantia.todas
    .map((g) => [g.tipo, g.valor !== undefined ? formatCurrency(g.valor) : null, `${g.vencimento < hoje ? 'venceu' : 'vence'} em ${formatDateBR(g.vencimento)}`].filter(Boolean).join(' · '))
    .join('. ');
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
  loadingOfficial = false,
  children
}) => {
  const navigate = useNavigateWithOrigin();

  const back = useBackTarget({ path: '/contratos', label: 'Voltar para Carteira' });
  const handleBack = onBack ?? back.back;

  const contractKey = chaveDoContrato(contract) || contract.numeroControlePncp || 'unknown-contract';

  const syncMutation = useSyncContractEmpenhos(contractKey);
  // Itens da ata são gravados por RPCs de gestor/admin: só esses perfis refazem a parte dos itens.
  const { role } = useAuth();
  const canRefreshItems = role === 'gestor' || role === 'admin';
  const { data: manager, isLoading: loadingManager } = useContractManager(contractKey);
  // Id PNCP e data de divulgação: o Contratos.gov.br não os devolve; vêm do PNCP e só aparecem se o PNCP responder.
  const { data: pncp, isLoading: loadingPncp } = useContractPncp(contract);
  const numeroControlePncp = contract.numeroControlePncp || pncp?.numeroControlePncp;
  // Ata de origem: o PNCP diz de qual ata o contrato decorre; os dados dessa ata dão o número e a UASG.
  const { data: ataPncp } = useAtaPncp({ numeroControlePncpAta: pncp?.numeroControlePncpAta });
  const ataOrigem = ataDeOrigem(ataPncp);

  // RBAC: gestor, coordenador e admin possuem permissão
  const isAuthorized =
    userRole !== undefined
      ? ['gestor', 'coordenador', 'admin'].includes(userRole)
      : canSync !== undefined
      ? canSync
      : true;

  const handleSync = () => {
    if (!isAuthorized || syncMutation.isPending) return;
    // O alvo sai do próprio contrato: id do Contratos.gov.br (buscado e gravado se faltar), UASG e,
    // para a conferência com o PNCP, o id do PNCP que a tela já conhece.
    syncMutation.mutate({
      contrato: contract,
      numeroControlePncp,
      refreshItems: canRefreshItems ? contract : undefined
    });
  };

  const pncpUrl =
    contract.linkPncp ||
    (numeroControlePncp
      ? `https://pncp.gov.br/app/contratos/${numeroControlePncp}`
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

  // Conferência com o PNCP: empenho que ele lista e o Contratos.gov.br não (nada do PNCP é gravado).
  const avisosPncp = syncMutation.data ? pendenciasPncp(syncMutation.data) : [];
  const removidos = syncMutation.data ? avisoVinculosRemovidos(syncMutation.data) : undefined;
  const pncpResumo = [removidos, ...avisosPncp].filter(Boolean).map((a) => ` ${a}`).join('');

  // Feedback operacional da sincronização de empenhos
  const getFeedbackConfig = (status?: OrchestrationStatus): { tone: NoticeBarTone; message: string } => {
    switch (status) {
      case 'SUCESSO':
        return {
          tone: (itensRefresh && itensRefresh.falhas.length > 0) || avisosPncp.length > 0 || removidos ? 'warning' : 'success',
          message: `Sincronização concluída. ${
            syncMutation.data?.empenhos_persistidos ?? syncMutation.data?.empenhos_encontrados ?? 0
          } empenho(s) processado(s) e atualizado(s) com sucesso.${pncpResumo}${itensResumo}`
        };
      case 'SEM_DADOS':
        return {
          tone: avisosPncp.length > 0 ? 'warning' : 'info',
          message: `O Contratos.gov.br respondeu que este contrato não tem empenho.${pncpResumo}${itensResumo}`
        };
      case 'SUCESSO_PARCIAL': {
        const motivo = syncMutation.data ? mensagemDoResultado(syncMutation.data) : undefined;
        return {
          tone: 'warning',
          message: `Sincronização parcial: ${syncMutation.data?.empenhos_persistidos ?? 0} empenho(s) gravado(s).${motivo ? ` ${motivo}` : ''}${itensResumo}`
        };
      }
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
  const expirado = contract.statusVigencia === 'Expirado';
  const faixa = classifyPrazo(dias, expirado);
  const numDisplay = formatContractNumber(contract);
  // `categoria` vem do Contratos.gov.br; o Compras.gov.br a chama de `nomeCategoria`.
  const categoriaRaw = contract.raw?.categoria ?? contract.raw?.nomeCategoria;
  const categoria = typeof categoriaRaw === 'string' ? categoriaRaw : undefined;

  // Fiscais e garantia vêm do Contratos.gov.br (uma consulta cada, ao abrir o contrato). Enquanto não
  // chegam, ou se falharem, não aparece nada: "Não informado" só vale quando a API respondeu e veio vazio.
  const { data: responsaveis, isSuccess: responsaveisOk } = useContractResponsaveis(contract);
  const { data: garantiasRows } = useContractGarantias(contract);
  const fiscais = fiscaisAtivos(responsaveis);
  const garantia = garantiaMaisLonga(garantiasRows);
  const hoje = formatDateISO(new Date());

  return (
    <Instrument360Hero
      backLabel={back.label}
      onBack={handleBack}
      actions={
        <>
          {pncpUrl && (
            <a href={pncpUrl} target="_blank" rel="noopener noreferrer" className="pncp-link" style={pncpLinkStyle}>
              <ExternalLink size={13} /> Contrato no PNCP
            </a>
          )}
          {/* Empenhos de contrato não são atualizados automaticamente: este é o único
              gatilho por contrato (o lote fica em Execução Financeira). */}
          <ActionButton
            action="sincronizar"
            size="sm"
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
          </ActionButton>
        </>
      }
      notice={
        showFeedback && feedback ? (
          <NoticeBar tone={feedback.tone} testId="contract-sync-feedback" onDismiss={() => syncMutation.reset()}>
            {feedback.message}
          </NoticeBar>
        ) : null
      }
      eyebrow={[contract.uasg ? `UASG ${contract.uasg}` : '', contract.nomeUnidadeGestora].filter(Boolean).join(' · ')}
      title={`Contrato nº ${numDisplay}`}
      status={{ faixa: expirado ? 'EXPIRADO' : 'REGULAR', label: instrumentSituationLabel(faixa, false), neutral: !expirado }}
      dockSubtitle={contract.fornecedorNome || undefined}
      manager={<ManagerInfo label="Gestor do contrato" gestorNome={manager?.gestorNome} isLoading={loadingManager} testId="contract-manager-info" />}
      subtitle={
        contract.fornecedorNome ? (
          <>
            <strong style={{ color: '#0f172a' }}>{contract.fornecedorNome}</strong>
            {contract.fornecedorCnpjCpf && <span> · CNPJ {formatCnpj(contract.fornecedorCnpjCpf)}</span>}
          </>
        ) : undefined
      }
      objeto={contract.objeto}
      origin={
        ataOrigem
          ? {
              label: 'Ata de origem',
              value:
                ataOrigem.uasg && isUasgCglic(ataOrigem.uasg) ? (
                  <AppButton
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => navigate(buildAtaPath(ataOrigem.numeroAta, ataOrigem.uasg as string))}
                  >
                    nº {ataOrigem.numeroAta}
                  </AppButton>
                ) : (
                  <span>nº {ataOrigem.numeroAta}</span>
                )
            }
          : undefined
      }
      dates={[
        // Sem o dado, a linha continua e diz que não foi informado; só espera enquanto a fonte ainda responde.
        ...(contract.dataAssinatura
          ? [{ label: 'Assinatura', value: formatDateBR(contract.dataAssinatura) }]
          : loadingOfficial ? [] : [{ label: 'Assinatura', value: <MissingValue />, title: 'O Contratos.gov.br não informou a data de assinatura deste contrato.' }]),
        ...(pncp?.dataPublicacaoPncp
          ? [{ label: 'Divulgação no PNCP', value: formatDateBR(pncp.dataPublicacaoPncp) }]
          : loadingPncp ? [] : [{ label: 'Divulgação no PNCP', value: <MissingValue />, title: 'O PNCP não respondeu ou não localizou este contrato.' }]),
        ...(contract.dataVigenciaFim
          ? [{
              label: 'Vigência',
              value: contract.dataVigenciaInicio ? `${formatDateBR(contract.dataVigenciaInicio)} a ${formatDateBR(contract.dataVigenciaFim)}` : `até ${formatDateBR(contract.dataVigenciaFim)}`,
              emphasis: true
            }]
          : []),
        ...(garantia
          ? [{
              label: 'Garantia',
              value: `até ${formatDateBR(garantia.principal.vencimento)}`,
              title: garantiaDetalhe(garantia, hoje),
              risk: garantiaAviso(garantia, contract.dataVigenciaFim, hoje)
            }]
          : [])
      ]}
      identifiersTestId="contract-header-metadata"
      identifiers={[
        { label: 'Processo', value: contract.processo },
        { label: 'Categoria', value: categoria },
        ...(responsaveisOk
          ? fiscais.length > 0
            ? fiscais.map((grupo) => ({ label: grupo.label, value: grupo.nomes.join(', ') }))
            : [{ label: 'Fiscal técnico', value: undefined }]
          : []),
        // Sem Id conhecido o campo some: não há o que mostrar, e "Não informado" aqui seria só ruído.
        ...(numeroControlePncp ? [{ label: 'Id PNCP', value: numeroControlePncp }] : [])
      ]}
    >
      {children}
    </Instrument360Hero>
  );
};
