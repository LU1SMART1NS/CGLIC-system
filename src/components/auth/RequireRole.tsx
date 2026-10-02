import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isSupabaseConfigured } from '../../services/supabaseClient';
import type { AppRole } from '../../types/rbac';
import { EmptyState } from '../../design-system/components/EmptyState';
import { AppButton } from '../../design-system/components/AppButton';

export interface RequireRoleProps {
  allowedRoles: AppRole[];
  children: React.ReactNode;
}

/**
 * Área segura para onde redirecionar um usuário autenticado mas não
 * autorizado a ver a rota atual. gestor_saldos não tem acesso a Contratos,
 * Financeiro nem Administração (fora do seu domínio), por isso ganha um destino próprio.
 */
function getSafeFallbackRoute(role: AppRole | null): string {
  if (role === 'gestor_saldos') return '/atas/saldos-unidade';
  return '/instrumentos';
}

/**
 * Camada central de AUTORIZAÇÃO de rotas (complementar a `ProtectedLayout`,
 * que só cobre AUTENTICAÇÃO). Não reimplementa nenhuma regra do RBAC — só lê
 * `role`/`roleStatus` já resolvidos por `AuthContext` a partir de
 * public.user_roles. Usar em <Route element={<RequireRole allowedRoles={[...]}>...}>
 * apenas nas rotas que exigem uma role específica; rotas sem necessidade de
 * restrição continuam sem este wrapper.
 */
export const RequireRole: React.FC<RequireRoleProps> = ({ allowedRoles, children }) => {
  const { loading, role, roleStatus } = useAuth();
  const navigate = useNavigate();

  // Sem Supabase configurado (ex.: suíte de testes) não há RBAC real a
  // aplicar — preserva o mesmo bypass que ProtectedLayout já usa hoje.
  if (!isSupabaseConfigured) {
    return <>{children}</>;
  }

  if (loading || roleStatus === 'loading') {
    return (
      <div
        data-testid="require-role-loading"
        style={{
          minHeight: '40vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#64748b',
          fontSize: '0.9rem',
          fontWeight: 600
        }}
      >
        Verificando permissões de acesso...
      </div>
    );
  }

  const authorized = role !== null && allowedRoles.includes(role);

  if (!authorized) {
    return (
      <div data-testid="require-role-denied" style={{ padding: '2rem' }}>
        <EmptyState
          icon={<ShieldAlert size={32} color="#e11d48" aria-hidden="true" />}
          title="Acesso não autorizado"
          description="Seu perfil não tem permissão para acessar esta área do sistema."
          action={
            <AppButton variant="primary" onClick={() => navigate(getSafeFallbackRoute(role))}>
              Voltar para uma área disponível
            </AppButton>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
};
