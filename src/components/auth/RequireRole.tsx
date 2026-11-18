import React from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, ShieldAlert } from 'lucide-react';
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
 * autorizado a ver a rota atual. gestor_saldos não tem acesso a Contratos, ao
 * Financeiro nem à Administração (fora do seu domínio), por isso ganha um destino próprio;
 * o gestor de emendas cai no Início dele (avisos dos pedidos e saldo da CAEP) e o gestor de fiscalização também.
 */
function getSafeFallbackRoute(role: AppRole | null): string {
  if (role === 'gestor_saldos') return '/itens';
  if (role === 'gestor_emendas') return '/emendas/inicio';
  if (role === 'gestor_fiscalizacao') return '/fiscalizacao/inicio';
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
  const { loading, role, roleStatus, recarregarPerfil } = useAuth();
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

  // A leitura do perfil falhou (já repetida pelo AuthContext): não é falta de permissão. Não libera a tela, mas também
  // não diz "Acesso não autorizado" a quem tem acesso; oferece ler de novo.
  if (roleStatus === 'error') {
    return (
      <div data-testid="require-role-erro" style={{ padding: '2rem' }}>
        <EmptyState
          icon={<RefreshCw size={32} color="var(--primary)" aria-hidden="true" />}
          title="Não foi possível conferir seu perfil"
          description="A leitura do seu perfil no banco falhou. Suas permissões não mudaram: tente de novo em alguns segundos."
          action={
            <AppButton variant="primary" onClick={() => (recarregarPerfil ? recarregarPerfil() : window.location.reload())}>
              Tentar de novo
            </AppButton>
          }
        />
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
