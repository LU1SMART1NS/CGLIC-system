import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ArrowLeft, Layers, Link2, ListTodo, Loader2, Search } from 'lucide-react';
import { useAta, useAtaItemSaldos, useAtaLinkedContracts } from '../../hooks/useAta';
import { useAtaTaskPlan } from '../../hooks/useAtaTaskPlan';
import { useAssignedManagementScope } from '../../hooks/useAssignedManagementScope';
import { useAuth } from '../../context/AuthContext';
import { Ata360Header } from './Ata360Header';
import { Ata360Summary } from './Ata360Summary';
import { AtaAttentionCenter } from './AtaAttentionCenter';
import { AtaItemsTable } from './AtaItemsTable';
import { AtaLinkedContracts } from './AtaLinkedContracts';
import { AtaTasksSection } from './AtaTasksSection';
import { Contract360Section } from '../contracts/Contract360Section';

interface Ata360PageProps {
  ataKeyOverride?: string;
  uasg?: string;
}

export const Ata360Page: React.FC<Ata360PageProps> = ({ ataKeyOverride, uasg = '200331' }) => {
  const { ataKey: paramAtaKey } = useParams<{ ataKey: string }>();
  const navigate = useNavigate();
  const ataKey = ataKeyOverride || (paramAtaKey ? decodeURIComponent(paramAtaKey) : undefined);

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
  const { role } = useAuth();
  const { ataKeys: assignedAtaKeys, isLoading: loadingScope } = useAssignedManagementScope(uasg);
  const isScopedRole = role === 'gestor';
  const isOwnAta = Boolean(arp && assignedAtaKeys?.includes(arp.numeroAtaRegistroPreco));

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

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>
      <Ata360Header arp={arp} itens={itens} />

      <Contract360Section
        id="ata-attention-section"
        title="O que precisa da minha atenção?"
        subtitle="Itens com saldo físico crítico e lembretes de planejamento do motor temporal"
        icon={AlertTriangle}
      >
        <AtaAttentionCenter arp={arp} saldos={saldos} isLoading={loadingSaldos} />
      </Contract360Section>

      <Contract360Section
        id="ata-items-section"
        title="Itens da Ata"
        subtitle="Saldo físico (quantidade homologada, consumida e disponível) por item"
        icon={Layers}
      >
        <AtaItemsTable itens={itens} saldos={saldos} />
      </Contract360Section>

      <Contract360Section
        id="ata-linked-contracts-section"
        title="Contratos Vinculados"
        subtitle="Contratos oficiais vinculados a itens desta Ata (arp_item_contract_links)"
        icon={Link2}
      >
        <AtaLinkedContracts linkedContracts={linkedContracts} isLoading={loadingLinks} />
      </Contract360Section>

      <Contract360Section
        id="ata-tasks-section"
        title="Tarefas e Providências"
        subtitle="Modelo de Gestão aplicado à Ata, com acompanhamento dinâmico das macrotarefas"
        icon={ListTodo}
      >
        <AtaTasksSection ataKey={arp.numeroAtaRegistroPreco} plan={taskPlan} isLoading={loadingTaskPlan} />
      </Contract360Section>

      <Ata360Summary arp={arp} />
    </div>
  );
};
