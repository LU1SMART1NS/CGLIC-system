import React from 'react';
import { useParams } from 'react-router-dom';
import { useBackTarget, useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { AlertTriangle, Layers, Link2, ListTodo, Plus } from 'lucide-react';
import { buildAtaItemPath, uasgFromAtaKey, useAta, useAtaItemSaldos, useAtaLinkedContracts } from '../../hooks/useAta';
import { useAtaTaskPlan } from '../../hooks/useAtaTaskPlan';
import { useAssignedManagementScope } from '../../hooks/useAssignedManagementScope';
import { useAuth } from '../../context/AuthContext';
import { InstrumentPageState } from '../instrument360/InstrumentPageState';
import { Ata360Header } from './Ata360Header';
import { AtaActionQueue, type Ata360Tab } from './AtaActionQueue';
import { useAtaActionQueue } from '../../hooks/useAtaActionQueue';
import { Instrument360Tabs } from '../instrument360/Instrument360Tabs';
import { AtaItemsTable } from './AtaItemsTable';
import { AtaLinkedContracts } from './AtaLinkedContracts';
import { AtaTasksSection } from './AtaTasksSection';
import { InstrumentSection } from '../instrument360/InstrumentSection';
import { Instrument360Page } from '../instrument360/Instrument360Page';
import { Instrument360TabPanel } from '../instrument360/Instrument360TabPanel';
import { useInstrumentTab } from '../instrument360/useInstrumentTab';
import { LinkContractModal, type LinkableAtaItemOption } from '../modals/LinkContractModal';
import { useUnlinkContractFromItem } from '../../hooks/useUnlinkContractFromItem';
import { useToast, useConfirmDialog } from '../../design-system';
import { normalizeItemKey } from '../../utils/itemKeyUtils';
import type { EnrichedArpItemContract } from '../../types/arpContractLinks';
import { UASG_LINK_LEGADO } from '../../config/unidadesGestoras';
import { quantidadeBaseSenasp } from '../../utils/quantitativoSenasp';

const TAB_IDS: Ata360Tab[] = ['acoes', 'plano', 'itens', 'contratos'];
// Gestor de Saldo (domínio de alocações) só precisa chegar aos itens da ata.
const SALDOS_TAB_IDS: Ata360Tab[] = ['itens'];

interface Ata360PageProps {
  ataKeyOverride?: string;
  uasg?: string;
}

export const Ata360Page: React.FC<Ata360PageProps> = ({ ataKeyOverride, uasg: uasgProp }) => {
  const { ataKey: paramAtaKey } = useParams<{ ataKey: string }>();
  const navigate = useNavigateWithOrigin();
  const back = useBackTarget({ path: '/atas', label: 'Voltar para Atas' });
  const ataKey = ataKeyOverride || (paramAtaKey ? decodeURIComponent(paramAtaKey) : undefined);
  // A chave canônica é "NUMERO-UASG" (ex.: 00059/2025-200331): sem prop, usa a UASG da chave.
  const uasg = uasgProp || uasgFromAtaKey(ataKey) || UASG_LINK_LEGADO;

  const { arp, itens, isLoading, isError, error, refetch } = useAta(ataKey, uasg);
  const { saldos, isLoading: loadingSaldos } = useAtaItemSaldos(arp?.numeroAtaRegistroPreco, uasg);
  const { linkedContracts, isLoading: loadingLinks } = useAtaLinkedContracts(arp?.numeroAtaRegistroPreco, uasg);
  const { data: taskPlan = null, isLoading: loadingTaskPlan } = useAtaTaskPlan(
    arp?.numeroAtaRegistroPreco || '',
    Boolean(arp)
  );

  // Escopo ASSIGNED do perfil "gestor" (ata_managers/arp_item_contract_links —
  // ver useAssignedManagementScope.ts), mesma guarda de deep-link já aplicada
  // no Contract360Page para /contratos/:contractKey.
  const queue = useAtaActionQueue(arp, saldos, taskPlan);

  const { role } = useAuth();
  const saldosOnly = role === 'gestor_saldos';
  const { activeTab, goToTab, tabsRef } = useInstrumentTab<Ata360Tab>({
    tabs: saldosOnly ? SALDOS_TAB_IDS : TAB_IDS,
    defaultTab: saldosOnly ? 'itens' : 'acoes'
  });
  const { ataKeys: assignedAtaKeys, isLoading: loadingScope } = useAssignedManagementScope(uasg);
  const isScopedRole = role === 'gestor';
  const isOwnAta = Boolean(arp && assignedAtaKeys?.includes(arp.numeroAtaRegistroPreco));
  // Mesma regra das RPCs link/unlink_contract_to_item_atomic (has_role gestor/admin)
  const canEditLinks = role === 'admin' || role === 'gestor';
  // O quantitativo SENASP dos itens é gravado em segundo plano (useSincronizacaoEmSegundoPlano); a tela só lê.

  const [isLinkModalOpen, setIsLinkModalOpen] = React.useState(false);
  const unlinkMutation = useUnlinkContractFromItem();
  const toast = useToast();
  const confirm = useConfirmDialog();
  const [unlinkingId, setUnlinkingId] = React.useState<string | null>(null);

  const handleUnlink = async (link: EnrichedArpItemContract) => {
    const ok = await confirm({
      title: 'Desvincular contrato',
      message: `Desvincular o ${link.numeroContratoFormatado} do item ${link.itemKey.split('-').pop()} desta ata?`,
      confirmLabel: 'Desvincular',
      tone: 'danger'
    });
    if (!ok) return;
    setUnlinkingId(link.linkId);
    try {
      await unlinkMutation.mutateAsync({ linkId: link.linkId, itemKey: link.itemKey, contractKey: link.contractKey });
    } catch (err: any) {
      if (err?.code === 'UNAUTHORIZED' || err?.sqlState === '42501') {
        toast.error('Acesso negado: operação restrita a gestores e administradores do CGLIC.');
      } else {
        toast.error(`Erro ao desvincular contrato: ${err?.message || 'Erro desconhecido'}`);
      }
    } finally {
      setUnlinkingId(null);
    }
  };

  if (isLoading) {
    return <InstrumentPageState kind="loading" title="Carregando Visão 360° da Ata..." message="Sincronizando dados oficiais da Ata de Registro de Preços." />;
  }

  if (isError) {
    return (
      <InstrumentPageState
        kind="error"
        title="Falha ao carregar a Ata"
        message={error instanceof Error ? error.message : 'Não foi possível recuperar as informações da Ata.'}
        onRetry={() => refetch()}
        backLabel={back.label}
        onBack={back.back}
      />
    );
  }

  if (!arp) {
    return (
      <InstrumentPageState
        kind="notFound"
        title="Ata não encontrada"
        message={<>A chave informada (<code>{ataKey || 'N/A'}</code>) não corresponde a nenhuma Ata sincronizada na UASG {uasg}.</>}
        backLabel={back.label}
        onBack={back.back}
      />
    );
  }

  if (isScopedRole && loadingScope) {
    return <InstrumentPageState kind="loading" title="Verificando permissão de acesso..." />;
  }

  if (isScopedRole && !isOwnAta) {
    return (
      <InstrumentPageState
        kind="forbidden"
        title="Acesso não autorizado"
        message="Esta Ata não está atribuída a você. Seu perfil de gestor só permite visualizar a Visão 360° das Atas onde você é o gestor titular."
        backLabel={back.label}
        onBack={back.back}
      />
    );
  }

  const saldoByItem = new Map(saldos.map((s: any) => [String(Number(s.numero_item)), s]));
  const linkItemOptions: LinkableAtaItemOption[] = itens.map((item) => {
    const itemKey = normalizeItemKey(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora, item.numeroItem);
    return {
      itemKey,
      numeroItem: item.numeroItem,
      descricao: item.descricaoItem,
      fornecedorNome: item.nomeRazaoSocialFornecedor,
      fornecedorCnpj: item.niFornecedor,
      valorUnitario: item.valorUnitario,
      quantidadeHomologada:
        (saldoByItem.has(String(Number(item.numeroItem))) ? quantidadeBaseSenasp(saldoByItem.get(String(Number(item.numeroItem)))) : undefined) ??
        item.quantidadeHomologadaVencedor ??
        item.quantidadeHomologadaItem,
      linkedContractKeys: linkedContracts.filter((l) => l.itemKey === itemKey).map((l) => l.contractKey)
    };
  });
  const linkSuggestionCriteria = {
    compra: {
      idCompra: arp.idCompra,
      uasg: arp.codigoUnidadeGerenciadora,
      numeroCompra: arp.numeroCompra,
      anoCompra: arp.anoCompra
    },
    fornecedorCnpjs: itens.map((i) => i.niFornecedor).filter(Boolean)
  };
  const linkButton = canEditLinks && itens.length > 0 ? (
    <button
      type="button"
      onClick={() => setIsLinkModalOpen(true)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.85rem', backgroundColor: '#0c326f', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
    >
      <Plus size={14} /> Vincular Contrato
    </button>
  ) : null;

  const allTabs: { id: Ata360Tab; label: string }[] = [
    { id: 'acoes', label: queue.items.length > 0 ? `Ações (${queue.items.length})` : 'Ações' },
    { id: 'plano', label: 'Plano de gestão' },
    { id: 'itens', label: `Itens (${itens.length})` },
    { id: 'contratos', label: linkedContracts.length > 0 ? `Contratos vinculados (${linkedContracts.length})` : 'Contratos vinculados' }
  ];
  const tabs = saldosOnly ? allTabs.filter((t) => SALDOS_TAB_IDS.includes(t.id)) : allTabs;

  return (
    <Instrument360Page>
      <Ata360Header
        arp={arp}
        itens={itens}
        saldos={saldos}
        actionItems={queue.items}
        linkedContractsCount={linkedContracts.length}
        isLoadingSaldos={loadingSaldos}
        onOpenActions={() => goToTab('acoes')}
        onOpenItens={() => goToTab('itens')}
        onOpenContratos={() => goToTab('contratos')}
      />

      <Instrument360Tabs
        ref={tabsRef}
        tabs={tabs}
        active={activeTab}
        onSelect={(tab) => goToTab(tab)}
        idPrefix="ata"
        ariaLabel="Seções da ata"
      />

      <Instrument360TabPanel idPrefix="ata" activeTab={activeTab}>
        {activeTab === 'acoes' && (
          <InstrumentSection
            id="ata-attention-section"
            title="Ações da ata"
            subtitle="Saldo dos itens, tarefas do plano e prazos de planejamento em ordem de prioridade"
            icon={AlertTriangle}
          >
            <AtaActionQueue
              queue={queue}
              ataKey={arp.numeroAtaRegistroPreco}
              plan={taskPlan}
              isLoading={loadingSaldos || loadingTaskPlan}
              onGoTo={(tab) => goToTab(tab)}
            />
          </InstrumentSection>
        )}

        {activeTab === 'plano' && (
          <InstrumentSection
            id="ata-tasks-section"
            title="Plano de gestão"
            subtitle="Todas as tarefas do modelo de gestão aplicado, com responsável, prazo e situação"
            icon={ListTodo}
          >
            <AtaTasksSection ataKey={arp.numeroAtaRegistroPreco} plan={taskPlan} isLoading={loadingTaskPlan} />
          </InstrumentSection>
        )}

        {activeTab === 'itens' && (
          <InstrumentSection
            id="ata-items-section"
            title="Itens da ata"
            subtitle="Saldo físico por item: quantidade homologada, consumida e disponível"
            icon={Layers}
          >
            <AtaItemsTable
              itens={itens}
              saldos={saldos}
              onSelectItem={(item) =>
                navigate(buildAtaItemPath(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora, item.numeroItem))
              }
            />
          </InstrumentSection>
        )}

        {activeTab === 'contratos' && (
          <InstrumentSection
            id="ata-linked-contracts-section"
            title="Contratos vinculados"
            subtitle="Contratos oficiais que usam itens desta ata"
            icon={Link2}
            actions={linkedContracts.length > 0 ? linkButton : undefined}
          >
            <AtaLinkedContracts
              linkedContracts={linkedContracts}
              isLoading={loadingLinks}
              emptyAction={linkButton}
              onUnlink={canEditLinks ? handleUnlink : undefined}
              unlinkingId={unlinkingId}
            />
          </InstrumentSection>
        )}
      </Instrument360TabPanel>

      {canEditLinks && (
        <LinkContractModal
          isOpen={isLinkModalOpen}
          onClose={() => setIsLinkModalOpen(false)}
          numeroAta={arp.numeroAtaRegistroPreco}
          uasg={arp.codigoUnidadeGerenciadora}
          itemOptions={linkItemOptions}
          suggestionCriteria={linkSuggestionCriteria}
        />
      )}
    </Instrument360Page>
  );
};
