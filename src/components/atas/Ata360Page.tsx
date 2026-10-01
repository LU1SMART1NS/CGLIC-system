import React from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ArrowLeft, Layers, Link2, ListTodo, Loader2, Plus, Search } from 'lucide-react';
import { buildAtaItemPath, uasgFromAtaKey, useAta, useAtaItemSaldos, useAtaLinkedContracts } from '../../hooks/useAta';
import { useAtaTaskPlan } from '../../hooks/useAtaTaskPlan';
import { useAssignedManagementScope } from '../../hooks/useAssignedManagementScope';
import { useAuth } from '../../context/AuthContext';
import { Ata360Header } from './Ata360Header';
import { AtaActionQueue, type Ata360Tab } from './AtaActionQueue';
import { useAtaActionQueue } from '../../hooks/useAtaActionQueue';
import { Instrument360Tabs } from '../instrument360/Instrument360Tabs';
import { AtaItemsTable } from './AtaItemsTable';
import { AtaLinkedContracts } from './AtaLinkedContracts';
import { AtaTasksSection } from './AtaTasksSection';
import { Contract360Section } from '../contracts/Contract360Section';
import { LinkContractModal, type LinkableAtaItemOption } from '../modals/LinkContractModal';
import { useUnlinkContractFromItem } from '../../hooks/useUnlinkContractFromItem';
import { normalizeItemKey } from '../../utils/itemKeyUtils';
import type { EnrichedArpItemContract } from '../../types/arpContractLinks';

const TAB_IDS: Ata360Tab[] = ['acoes', 'plano', 'itens', 'contratos'];

interface Ata360PageProps {
  ataKeyOverride?: string;
  uasg?: string;
}

export const Ata360Page: React.FC<Ata360PageProps> = ({ ataKeyOverride, uasg: uasgProp }) => {
  const { ataKey: paramAtaKey } = useParams<{ ataKey: string }>();
  const navigate = useNavigate();
  const ataKey = ataKeyOverride || (paramAtaKey ? decodeURIComponent(paramAtaKey) : undefined);
  // A chave canônica é "NUMERO-UASG" (ex.: 00059/2025-200331): sem prop, usa a UASG da chave.
  const uasg = uasgProp || uasgFromAtaKey(ataKey) || '200331';

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

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('aba') as Ata360Tab | null;
  const activeTab: Ata360Tab = tabParam && TAB_IDS.includes(tabParam) ? tabParam : 'acoes';
  const tabsRef = React.useRef<HTMLDivElement>(null);
  const goToTab = (tab: Ata360Tab) => {
    setSearchParams(tab === 'acoes' ? {} : { aba: tab });
    tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const { role } = useAuth();
  const { ataKeys: assignedAtaKeys, isLoading: loadingScope } = useAssignedManagementScope(uasg);
  const isScopedRole = role === 'gestor';
  const isOwnAta = Boolean(arp && assignedAtaKeys?.includes(arp.numeroAtaRegistroPreco));
  // Mesma regra das RPCs link/unlink_contract_to_item_atomic (has_role gestor/admin)
  const canEditLinks = role === 'admin' || role === 'gestor';

  const [isLinkModalOpen, setIsLinkModalOpen] = React.useState(false);
  const unlinkMutation = useUnlinkContractFromItem();
  const [unlinkingId, setUnlinkingId] = React.useState<string | null>(null);

  const handleUnlink = async (link: EnrichedArpItemContract) => {
    if (!window.confirm(`Desvincular o ${link.numeroContratoFormatado} do item ${link.itemKey.split('-').pop()} desta ata?`)) return;
    setUnlinkingId(link.linkId);
    try {
      await unlinkMutation.mutateAsync({ linkId: link.linkId, itemKey: link.itemKey });
    } catch (err: any) {
      if (err?.code === 'UNAUTHORIZED' || err?.sqlState === '42501') {
        alert('Acesso negado: operação restrita a gestores e administradores do CGLIC.');
      } else {
        alert(`Erro ao desvincular contrato: ${err?.message || 'Erro desconhecido'}`);
      }
    } finally {
      setUnlinkingId(null);
    }
  };

  if (isLoading) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '2.5rem', textAlign: 'center', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
          <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', color: '#0c326f', margin: '0 auto 1rem auto' }} />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
            Carregando Visão 360° da Ata...
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
            Sincronizando dados oficiais da Ata de Registro de Preços.
          </p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #fecaca', padding: '2.5rem', textAlign: 'center', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
            <AlertCircle size={24} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#991b1b', margin: '0 0 0.5rem 0' }}>
            Falha ao carregar a Ata
          </h2>
          <p style={{ fontSize: '0.88rem', color: '#64748b', maxWidth: '500px', margin: '0 auto 1.5rem auto' }}>
            {error instanceof Error ? error.message : 'Não foi possível recuperar as informações da Ata.'}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button type="button" onClick={() => refetch()} style={{ padding: '0.5rem 1rem', backgroundColor: '#0c326f', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
              Tentar novamente
            </button>
            <button type="button" onClick={() => navigate('/atas')} style={{ padding: '0.5rem 1rem', backgroundColor: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
              Voltar para Atas
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!arp) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '3rem 2rem', textAlign: 'center', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '50%', backgroundColor: '#f1f5f9', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem auto' }}>
            <Search size={26} />
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
            Ata não encontrada
          </h2>
          <p style={{ fontSize: '0.9rem', color: '#64748b', maxWidth: '550px', margin: '0 auto 1.75rem auto' }}>
            A chave informada (<code style={{ backgroundColor: '#f1f5f9', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>{ataKey || 'N/A'}</code>) não corresponde a nenhuma Ata sincronizada na UASG {uasg}.
          </p>
          <button
            type="button"
            onClick={() => navigate('/atas')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.25rem', backgroundColor: '#0c326f', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}
          >
            <ArrowLeft size={16} /> Voltar para lista de Atas
          </button>
        </div>
      </div>
    );
  }

  if (isScopedRole && loadingScope) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '2.5rem', textAlign: 'center', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
          <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', color: '#0c326f', margin: '0 auto 1rem auto' }} />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
            Verificando permissão de acesso...
          </h2>
        </div>
      </div>
    );
  }

  if (isScopedRole && !isOwnAta) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #fecaca', padding: '2.5rem', textAlign: 'center', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
            <AlertCircle size={24} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#991b1b', margin: '0 0 0.5rem 0' }}>
            Acesso não autorizado
          </h2>
          <p style={{ fontSize: '0.88rem', color: '#64748b', maxWidth: '500px', margin: '0 auto 1.5rem auto' }}>
            Esta Ata não está atribuída a você. Seu perfil de gestor só permite visualizar a Visão 360° das Atas onde você é o gestor titular.
          </p>
          <button
            type="button"
            onClick={() => navigate('/atas')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.25rem', backgroundColor: '#0c326f', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}
          >
            <ArrowLeft size={16} /> Voltar para lista de Atas
          </button>
        </div>
      </div>
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
      quantidadeHomologada:
        saldoByItem.get(String(Number(item.numeroItem)))?.quantidade_homologada ??
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
      <Plus size={14} /> Vincular contrato
    </button>
  ) : null;

  const tabs: { id: Ata360Tab; label: string }[] = [
    { id: 'acoes', label: queue.items.length > 0 ? `Ações (${queue.items.length})` : 'Ações' },
    { id: 'plano', label: 'Plano de gestão' },
    { id: 'itens', label: `Itens (${itens.length})` },
    { id: 'contratos', label: linkedContracts.length > 0 ? `Contratos vinculados (${linkedContracts.length})` : 'Contratos vinculados' }
  ];

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
      <Ata360Header
        arp={arp}
        itens={itens}
        saldos={saldos}
        counts={queue.counts}
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
        onSelect={goToTab}
        idPrefix="ata"
        ariaLabel="Seções da ata"
      />

      <div role="tabpanel" id={`ata-tabpanel-${activeTab}`} aria-labelledby={`ata-tab-${activeTab}`}>
        {activeTab === 'acoes' && (
          <Contract360Section
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
              onGoTo={goToTab}
            />
          </Contract360Section>
        )}

        {activeTab === 'plano' && (
          <Contract360Section
            id="ata-tasks-section"
            title="Plano de gestão"
            subtitle="Todas as tarefas do modelo de gestão aplicado, com responsável, prazo e situação"
            icon={ListTodo}
          >
            <AtaTasksSection ataKey={arp.numeroAtaRegistroPreco} plan={taskPlan} isLoading={loadingTaskPlan} />
          </Contract360Section>
        )}

        {activeTab === 'itens' && (
          <Contract360Section
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
          </Contract360Section>
        )}

        {activeTab === 'contratos' && (
          <Contract360Section
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
          </Contract360Section>
        )}
      </div>

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
    </div>
  );
};
