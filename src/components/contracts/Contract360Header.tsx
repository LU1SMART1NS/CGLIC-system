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
import { formatCnpj, formatCurrency, formatDataHoraBR } from '../../utils/format';
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
import { useItensDoContrato } from '../../hooks/useItensDoContrato';

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
  // Contrato em mais de uma ata (migration 86): os vínculos dos itens dizem as atas e o item de cada uma.
  const { data: itensDoContrato } = useItensDoContrato(contractKey);
  const atasVinculadas = React.useMemo(() => {
    const porAta = new Map<string, { numeroAta: string; uasg: string; itens: number[] }>();
    for (const v of itensDoContrato?.vinculos ?? []) {
      const k = `${v.numeroAta}-${v.uasgAta}`;
      const a = porAta.get(k) ?? { numeroAta: v.numeroAta, uasg: v.uasgAta, itens: [] };
      if (!a.itens.includes(v.numeroItem)) a.itens.push(v.numeroItem);
      porAta.set(k, a);
    }
    return Array.from(porAta.values())
      .map((a) => ({ ...a, itens: a.itens.sort((x, y) => x - y) }))
      .sort((a, b) => a.numeroAta.localeCompare(b.numeroAta));
  }, [itensDoContrato]);

  // O PNCP pode trazer o número sem os zeros à esquerda ("5/2025"); o banco guarda "00005/2025".
  const numeroAtaPadrao = (n: string) => n.replace(/^(\d+)\//, (_, d: string) => `${d.padStart(5, '0')}/`);
  // Uma ata só: a do PNCP ou, sem ela, a do único vínculo. Tem link quando está no sistema: UASG da CGLIC ou ata de
  // outro órgão com vínculo (as de participação e adesão da SENASP entram na carteira pela migration 106).
  const origemUnica: { numeroAta: string; uasg?: string } | undefined = ataOrigem ?? (atasVinculadas.length === 1 ? atasVinculadas[0] : undefined);
  const origemNoSistema = Boolean(
    origemUnica?.uasg &&
      (isUasgCglic(origemUnica.uasg) ||
        atasVinculadas.some((a) => numeroAtaPadrao(a.numeroAta) === numeroAtaPadrao(origemUnica.numeroAta) && a.uasg === origemUnica.uasg))
  );

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
  // chegam, não aparece nada; se a consulta falhar, vale a cópia guardada pelo servidor (com a data) e, sem
  // cópia, a linha diz que a fonte não respondeu. "Não informado" só quando a API respondeu e veio vazio.
  const { data: responsaveis, isSuccess: responsaveisOk, isError: responsaveisFalhou } = useContractResponsaveis(contract);
  const { data: garantias, isError: garantiasFalhou } = useContractGarantias(contract);
  const fiscais = fiscaisAtivos(responsaveis?.dados);
  const garantia = garantiaMaisLonga(garantias?.dados);
  const notaCopiaFiscais = responsaveis?.origem === 'COPIA' && responsaveis.copiadoEm ? ` (cópia de ${formatDataHoraBR(responsaveis.copiadoEm)})` : '';
  const notaCopiaGarantia =
    garantias?.origem === 'COPIA' && garantias.copiadoEm
      ? `O Contratos.gov.br não respondeu agora; cópia lida em ${formatDataHoraBR(garantias.copiadoEm)}. `
      : '';
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
        atasVinculadas.length > 1
          ? {
              label: 'Atas de origem',
              value: (
                <span data-testid="contract-atas-de-origem" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.1rem' }}>
                  {atasVinculadas.map((a) => (
                    <span key={`${a.numeroAta}-${a.uasg}`}>
                      {/* Ata com vínculo está no sistema, da CGLIC ou de outro órgão (migration 106): sempre abre. */}
                      <AppButton type="button" variant="link" size="sm" onClick={() => navigate(buildAtaPath(a.numeroAta, a.uasg))}>
                        nº {a.numeroAta}
                      </AppButton>
                      {!isUasgCglic(a.uasg) && <span style={{ color: '#64748b', fontWeight: 500 }}> · UASG {a.uasg}</span>}
                      <span style={{ color: '#64748b', fontWeight: 500 }}>
                        {' '}
                        · {a.itens.length === 1 ? 'item' : 'itens'} {a.itens.join(', ')}
                      </span>
                    </span>
                  ))}
                </span>
              )
            }
          : origemUnica
          ? {
              label: 'Ata de origem',
              value:
                origemUnica.uasg && origemNoSistema ? (
                  <span>
                    <AppButton
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => navigate(buildAtaPath(origemUnica.numeroAta, origemUnica.uasg as string))}
                    >
                      nº {origemUnica.numeroAta}
                    </AppButton>
                    {!isUasgCglic(origemUnica.uasg) && <span style={{ color: '#64748b', fontWeight: 500 }}> · UASG {origemUnica.uasg}</span>}
                  </span>
                ) : (
                  <span>nº {origemUnica.numeroAta}</span>
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
              title: notaCopiaGarantia + garantiaDetalhe(garantia, hoje),
              risk: garantiaAviso(garantia, contract.dataVigenciaFim, hoje)
            }]
          : garantiasFalhou
            ? [{
                label: 'Garantia',
                value: <MissingValue>sem resposta da fonte</MissingValue>,
                title: 'O Contratos.gov.br não respondeu e não há cópia guardada das garantias deste contrato.'
              }]
            : [])
      ]}
      identifiersTestId="contract-header-metadata"
      identifiers={[
        { label: 'Processo', value: contract.processo },
        { label: 'Categoria', value: categoria },
        ...(responsaveisOk
          ? fiscais.length > 0
            ? fiscais.map((grupo) => ({ label: grupo.label, value: grupo.nomes.join(', ') + notaCopiaFiscais }))
            : [{ label: 'Fiscal técnico', value: notaCopiaFiscais ? `Não informado${notaCopiaFiscais}` : undefined }]
          : responsaveisFalhou
            ? [{ label: 'Fiscal técnico', value: 'sem resposta do Contratos.gov.br' }]
            : []),
        // Sem Id conhecido o campo some: não há o que mostrar, e "Não informado" aqui seria só ruído.
        ...(numeroControlePncp ? [{ label: 'Id PNCP', value: numeroControlePncp }] : [])
      ]}
    >
      {children}
    </Instrument360Hero>
  );
};
