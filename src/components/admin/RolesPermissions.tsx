import React, { useState } from 'react';
import { KeyRound, Shield, UserCheck, Coins, Eye, X, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '../../design-system/components/PageHeader';
import { AppCard } from '../../design-system/components/AppCard';
import { AppButton } from '../../design-system/components/AppButton';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { SectionHeader } from '../../design-system/components/SectionHeader';
import { colors, spacing, typography } from '../../design-system/tokens';
import type { AppRole } from '../../types/rbac';

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
      { label: 'Contratos', description: 'Gestão completa' },
      { label: 'Execução financeira', description: 'Gestão' },
      { label: 'Alocações', description: 'Gestão completa' },
      { label: 'Unidades internas', description: 'Gestão' },
      { label: 'Usuários e servidores', description: 'Gestão' },
      { label: 'Perfis', description: 'Gestão' }
    ],
    scope: 'Todas as unidades'
  },
  {
    id: 'gestor',
    label: 'Gestor de Atas e Contratos',
    description: 'Gestão das Atas atribuídas — e dos contratos vinculados a elas — além dos contratos avulsos atribuídos individualmente.',
    icon: UserCheck,
    areas: [
      { label: 'Atas', description: 'Consulta e gestão dentro do escopo atribuído' },
      { label: 'Contratos', description: 'Gestão dentro do escopo atribuído (via Ata ou atribuição direta)' },
      { label: 'Execução financeira', description: 'Gestão' }
    ],
    scope: 'Atas atribuídas (com os contratos vinculados) e contratos avulsos atribuídos individualmente'
  },
  {
    id: 'gestor_saldos',
    label: 'Gestor de Saldo',
    description: 'Gestão das alocações internas das Atas e das unidades internas.',
    icon: Coins,
    areas: [
      { label: 'Alocações', description: 'Gestão completa' },
      { label: 'Unidades internas', description: 'Gestão' }
    ],
    scope: 'Todas as Atas'
  },
  {
    id: 'leitor',
    label: 'Consulta / Auditoria',
    description: 'Consulta das informações do sistema, sem funções de administração.',
    icon: Eye,
    areas: [
      { label: 'Contratos', description: 'Consulta' },
      { label: 'Alocações', description: 'Consulta' },
      { label: 'Unidades internas', description: 'Consulta' },
      { label: 'Execução financeira', description: 'Consulta, somente onde o frontend já disponibilizar essa consulta' }
    ],
    scope: 'Informações disponíveis para consulta'
  }
];

/**
 * Conteúdo de detalhe de um perfil ("Acesso por área" + abrangência).
 * Exportado à parte para ser testável isoladamente, sem depender de
 * simulação de clique (a suíte de testes deste projeto não usa jsdom).
 */
export const ProfileDetailContent: React.FC<{ profile: ProfileDefinition }> = ({ profile }) => {
  return (
    <div data-testid={`profile-detail-${profile.id}`} style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
      <div>
        <h2 style={{ margin: 0, fontSize: typography.fontSize.h4, fontWeight: 800, color: colors.text.primary }}>
          {profile.label}
        </h2>
        <p style={{ margin: `${spacing.xs} 0 0 0`, fontSize: typography.fontSize.bodySm, color: colors.text.secondary, lineHeight: 1.5 }}>
          {profile.description}
        </p>
      </div>

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
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            data-testid="profile-drawer-close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text.secondary, padding: spacing.xs }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: spacing.lg, overflowY: 'auto', flex: 1 }}>
          <ProfileDetailContent profile={profile} />
        </div>
      </div>
    </div>
  );
};

export const RolesPermissions: React.FC = () => {
  const [selectedProfileId, setSelectedProfileId] = useState<AppRole | null>(null);
  const selectedProfile = PROFILE_DEFINITIONS.find((p) => p.id === selectedProfileId) ?? null;

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1.5rem 2rem 3rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Perfis"
        subtitle="Perfis de acesso ao CGLIC e o que cada um pode consultar e gerir"
        icon={<KeyRound size={26} color="#0c326f" aria-hidden="true" />}
      />

      <div
        data-testid="profiles-cards-grid"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: spacing.lg }}
      >
        {PROFILE_DEFINITIONS.map((profile) => {
          const Icon = profile.icon;
          return (
            <AppCard
              key={profile.id}
              data-testid={`profile-card-${profile.id}`}
              style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                <Icon size={20} color="#0c326f" aria-hidden="true" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: colors.text.primary }}>
                  {profile.label}
                </h3>
              </div>

              <p style={{ margin: 0, fontSize: typography.fontSize.bodySm, color: colors.text.secondary, lineHeight: 1.5, flex: 1 }}>
                {profile.description}
              </p>

              <div style={{ alignSelf: 'flex-start' }}>
                <StatusBadge label="Perfil do sistema" variant="neutral" size="sm" />
              </div>

              <AppButton
                variant="outline"
                size="sm"
                onClick={() => setSelectedProfileId(profile.id)}
                data-testid={`ver-detalhes-${profile.id}`}
                icon={<ChevronRight size={14} />}
                style={{ alignSelf: 'flex-start' }}
              >
                Ver detalhes
              </AppButton>
            </AppCard>
          );
        })}
      </div>

      <ProfileDrawer profile={selectedProfile} onClose={() => setSelectedProfileId(null)} />
    </div>
  );
};
