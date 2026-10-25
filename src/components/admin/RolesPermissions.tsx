import React, { useState } from 'react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { KeyRound, Shield, UserCheck, Coins, Eye, ScrollText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '../../design-system/components/PageHeader';
import { AppCard } from '../../design-system/components/AppCard';
import { ActionButton } from '../../design-system/components/ActionButton';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { SectionHeader } from '../../design-system/components/SectionHeader';
import { colors, spacing, typography } from '../../design-system/tokens';
import type { AppRole } from '../../types/rbac';
import type { RoleDefinition } from '../../types/user';
import { useRoles, useRenameRole } from '../../hooks/useRoles';
import { useAuth } from '../../context/AuthContext';
import { AppInput } from '../../design-system/components/FormFields';
import { useToast } from '../../design-system/components/Toast';

export interface ProfileArea {
  label: string;
  description: string;
}

export interface ProfileDefinition {
  /** Role real do backend (public.roles.id) — fonte de verdade da autorização. */
  id: AppRole;
  label: string;
  description: string;
  icon: LucideIcon;
  /**
   * Áreas de negócio às quais o perfil tem acesso. A ausência de uma área
   * aqui já significa "sem acesso" — não listamos negativos explicitamente.
   */
  areas: ProfileArea[];
  /** Abrangência em linguagem de negócio (nunca GLOBAL/ASSIGNED/UNIT crus). */
  scope: string;
}

/**
 * Configuração PRESENCIONAL fixa dos 4 perfis nativos do CGLIC-system.
 * Isto NÃO é fonte de autorização — é só texto de apresentação em linguagem
 * de negócio. A autorização real continua inteiramente no backend
 * (public.role_permissions / role_domain_scopes), já refletida no frontend
 * por AuthContext/Sidebar/RequireRole (Fase Frontend RBAC).
 */
export const PROFILE_DEFINITIONS: ProfileDefinition[] = [
  {
    id: 'admin',
    label: 'Coordenador',
    description: 'Administração geral do sistema e gestão de todos os domínios.',
    icon: Shield,
    areas: [
      { label: 'Início e Distribuição', description: 'Visão de toda a carteira e das emendas; distribui atas e contratos entre os gestores e ajusta a complexidade e o nível de cada gestor' },
      { label: 'Atas e Itens', description: 'Gestão completa, de todas as atas, inclusive o reajuste dos preços registrados' },
      { label: 'Contratos', description: 'Gestão completa, de todos os contratos' },
      { label: 'Vínculos', description: 'Gestão completa: contratos à ata, notas de empenho ao contrato e aos itens' },
      { label: 'Execução financeira', description: 'Gestão completa de pagamentos e empenhos, inclusive excluir ciclos de pagamento' },
      { label: 'Alocações', description: 'Gestão completa' },
      { label: 'Emendas', description: 'Gestão completa, com o contato da assessoria dos parlamentares' },
      { label: 'Unidades internas e grupos das UASGs', description: 'Gestão' },
      { label: 'Modelos de gestão, alertas e feriados', description: 'Gestão' },
      { label: 'Usuários e servidores', description: 'Gestão' },
      { label: 'Perfis', description: 'Gestão, inclusive renomear os perfis' }
    ],
    scope: 'Todas as atas e todos os contratos'
  },
  {
    id: 'gestor',
    label: 'Gestor de Atas e Contratos',
    description: 'Gestão das Atas atribuídas — e dos contratos vinculados a elas — além dos contratos avulsos atribuídos individualmente.',
    icon: UserCheck,
    areas: [
      { label: 'Início', description: 'Consulta das pendências das atas e contratos atribuídos' },
      { label: 'Atas e Itens', description: 'Gestão dentro do escopo atribuído: reajuste dos preços, quantidades da ata assinada e a unidade interna de cada nota de empenho' },
      { label: 'Contratos', description: 'Gestão dentro do escopo atribuído (via Ata ou atribuição direta): tarefas, prazos e atualização de itens' },
      { label: 'Vínculos', description: 'Gestão dentro do escopo atribuído: contratos à ata, notas de empenho ao contrato e aos itens' },
      { label: 'Execução financeira', description: 'Gestão de pagamentos e empenhos dos contratos do escopo; não exclui ciclos de pagamento' },
      { label: 'Emendas', description: 'Consulta, na aba Emendas do item: o que a CAEP reservou a cada parlamentar' },
      { label: 'Unidades internas e grupos das UASGs', description: 'Consulta' },
      { label: 'Modelos de gestão', description: 'Gestão' }
    ],
    scope: 'Atas atribuídas (com os contratos vinculados) e contratos avulsos atribuídos individualmente'
  },
  {
    id: 'gestor_saldos',
    label: 'Gestor de Saldo',
    description: 'Gestão das alocações internas das Atas e das unidades internas.',
    icon: Coins,
    areas: [
      { label: 'Início', description: 'Consulta, somente os alertas de saldo das Atas' },
      { label: 'Atas e Itens', description: 'Consulta, sem contratos, para acompanhar o saldo dos itens' },
      { label: 'Alocações', description: 'Gestão completa das alocações; a unidade interna de cada nota de empenho fica com o gestor da ata e o coordenador' },
      { label: 'Emendas', description: 'Consulta, na aba Emendas do item: quanto da cota da CAEP já está reservado' },
      { label: 'Unidades internas', description: 'Gestão' },
      { label: 'Grupos das UASGs', description: 'Consulta' }
    ],
    scope: 'Todas as Atas'
  },
  {
    id: 'gestor_emendas',
    label: 'Gestor de Emendas',
    description: 'Servidor da CAEP: reparte entre parlamentares a quantidade alocada à CAEP.',
    icon: ScrollText,
    areas: [
      { label: 'Início', description: 'Resumo dos pedidos e do saldo livre da CAEP' },
      { label: 'Emendas', description: 'Gestão de pedidos, kits e beneficiários, com o contato da assessoria dos parlamentares' },
      { label: 'Atas e Itens', description: 'Consulta, sem contratos; o reajuste dos preços da ata só para consulta' }
    ],
    scope: 'Itens alocados à CAEP'
  },
  {
    id: 'leitor',
    label: 'Consulta / Auditoria',
    description: 'Consulta das informações do sistema, sem funções de administração.',
    icon: Eye,
    areas: [
      { label: 'Início', description: 'Consulta das pendências das atas e contratos e do resumo das emendas' },
      { label: 'Atas e Itens', description: 'Consulta' },
      { label: 'Contratos', description: 'Consulta' },
      { label: 'Execução financeira', description: 'Consulta de pagamentos e empenhos' },
      { label: 'Emendas', description: 'Consulta, sem o contato da assessoria dos parlamentares' },
      { label: 'Unidades internas, grupos das UASGs e beneficiários', description: 'Consulta' }
    ],
    scope: 'Todas as atas e todos os contratos, somente leitura; sem as filas de trabalho (Distribuição, Vínculos e Alocação)'
  }
];

/** Ids do catálogo de perfis (SYSTEM_ROLES) equivalentes ao id de backend de cada cartão. */
const CATALOG_ID_ALIASES: Partial<Record<AppRole, string>> = { admin: 'coordenador', leitor: 'consulta' };

/** Nome cadastrado do perfil no catálogo; cai no rótulo local se o catálogo não o tiver. */
export function resolveProfileLabel(profile: ProfileDefinition, roles: RoleDefinition[]): string {
  const alias = CATALOG_ID_ALIASES[profile.id];
  const found = roles.find((r) => r.id === profile.id) ?? (alias ? roles.find((r) => r.id === alias) : undefined);
  return found?.nome || profile.label;
}

/**
 * Conteúdo de detalhe de um perfil ("Acesso por área" + abrangência).
 * Exportado à parte para ser testável isoladamente, sem depender de
 * simulação de clique (a suíte de testes deste projeto não usa jsdom).
 */
export const ProfileDetailContent: React.FC<{ profile: ProfileDefinition }> = ({ profile }) => {
  return (
    <div data-testid={`profile-detail-${profile.id}`} style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
      <SectionHeader title={profile.label} subtitle={profile.description} className="section-header--flush" testId={`profile-detail-header-${profile.id}`} />

      <div>
        <SectionHeader title="Acesso por área" testId="profile-detail-areas-header" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          {profile.areas.map((area) => (
            <div
              key={area.label}
              data-testid={`profile-detail-area-${profile.id}-${area.label}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: spacing.md,
                padding: `${spacing.sm} 0`,
                borderBottom: `1px solid ${colors.border.subtle}`
              }}
            >
              <span style={{ fontWeight: 700, color: colors.text.primary, fontSize: typography.fontSize.bodySm }}>
                {area.label}
              </span>
              <span style={{ color: colors.text.secondary, fontSize: typography.fontSize.bodySm, textAlign: 'right' }}>
                {area.description}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionHeader title="Abrangência" testId="profile-detail-scope-header" />
        <p style={{ margin: 0, fontSize: typography.fontSize.bodySm, color: colors.text.primary, fontWeight: 600 }}>
          {profile.scope}
        </p>
      </div>
    </div>
  );
};

const ProfileDrawer: React.FC<{ profile: ProfileDefinition | null; onClose: () => void }> = ({ profile, onClose }) => {
  if (!profile) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detalhe do perfil ${profile.label}`}
      data-testid="profile-drawer"
      style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
    >
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.45)' }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          height: '100%',
          width: 'min(420px, 100%)',
          background: colors.background.surface,
          boxShadow: '-8px 0 24px rgba(15, 23, 42, 0.12)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: spacing.lg,
            borderBottom: `1px solid ${colors.border.subtle}`
          }}
        >
          <span style={{ fontSize: typography.fontSize.label, fontWeight: 700, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Detalhe do perfil
          </span>
          <ActionButton
            action="fechar"
            iconOnly
            type="button"
            onClick={onClose}
            data-testid="profile-drawer-close"
          />
        </div>
        <div style={{ padding: spacing.lg, overflowY: 'auto', flex: 1 }}>
          <ProfileDetailContent profile={profile} />
        </div>
      </div>
    </div>
  );
};

/** Título do cartão; o coordenador pode renomear o perfil (grava em public.roles.label). */
const ProfileCardTitle: React.FC<{ profile: ProfileDefinition; canEdit: boolean }> = ({ profile, canEdit }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.label);
  const [error, setError] = useState<string | undefined>();
  const rename = useRenameRole();
  const toast = useToast();

  const startEditing = () => {
    setDraft(profile.label);
    setError(undefined);
    setEditing(true);
  };

  const save = () => {
    const nome = draft.trim();
    if (nome.length < 3) {
      setError('O nome deve ter ao menos 3 caracteres.');
      return;
    }
    if (nome === profile.label) {
      setEditing(false);
      return;
    }
    rename.mutate(
      { id: profile.id, nome },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success('Nome do perfil atualizado.');
        },
        onError: (err) => setError(err.message)
      }
    );
  };

  if (editing) {
    return (
      <form
        data-testid={`profile-rename-form-${profile.id}`}
        onSubmit={(e) => { e.preventDefault(); save(); }}
        style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, flex: 1 }}
      >
        <AppInput
          label="Nome do perfil"
          value={draft}
          maxLength={60}
          autoFocus
          error={error}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div style={{ display: 'flex', gap: spacing.sm }}>
          <ActionButton action="salvar" type="submit" size="sm" disabled={rename.isPending} />
          <ActionButton action="cancelar" type="button" size="sm" onClick={() => setEditing(false)} />
        </div>
      </form>
    );
  }

  return (
    <>
      <h3 style={{ margin: 0, fontSize: typography.fontSize.h4, fontWeight: 800, color: colors.text.primary, flex: 1 }}>
        {profile.label}
      </h3>
      {canEdit && (
        <ActionButton
          action="renomear"
          iconOnly
          label={`Editar nome do perfil ${profile.label}`}
          onClick={startEditing}
          data-testid={`editar-nome-${profile.id}`}
        />
      )}
    </>
  );
};

export const RolesPermissions: React.FC = () => {
  const { role: myRole } = useAuth();
  const canEdit = myRole === 'admin';
  const [selectedProfileId, setSelectedProfileId] = useState<AppRole | null>(null);
  const { data: roles = [] } = useRoles();
  const profiles = PROFILE_DEFINITIONS.map((p) => ({ ...p, label: resolveProfileLabel(p, roles) }));
  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? null;

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Perfis"
        subtitle="Perfis de acesso ao CGLIC e o que cada um pode consultar e gerir"
        icon={<KeyRound size={26} color="var(--primary)" aria-hidden="true" />}
      />

      <div
        data-testid="profiles-cards-grid"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: spacing.lg }}
      >
        {profiles.map((profile) => {
          const Icon = profile.icon;
          return (
            <AppCard
              key={profile.id}
              data-testid={`profile-card-${profile.id}`}
              style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                <Icon size={20} color="var(--primary)" aria-hidden="true" />
                <ProfileCardTitle profile={profile} canEdit={canEdit} />
              </div>

              <p style={{ margin: 0, fontSize: typography.fontSize.bodySm, color: colors.text.secondary, lineHeight: 1.5, flex: 1 }}>
                {profile.description}
              </p>

              <div style={{ alignSelf: 'flex-start' }}>
                <StatusBadge label="Perfil do sistema" variant="neutral" size="sm" />
              </div>

              <ActionButton
                action="verDetalhes"
                label="Ver detalhes"
                size="sm"
                onClick={() => setSelectedProfileId(profile.id)}
                data-testid={`ver-detalhes-${profile.id}`}
                style={{ alignSelf: 'flex-start' }}
              />
            </AppCard>
          );
        })}
      </div>

      <ProfileDrawer profile={selectedProfile} onClose={() => setSelectedProfileId(null)} />
    </PageContainer>
  );
};
