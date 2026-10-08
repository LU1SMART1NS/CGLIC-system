import React, { useState, useMemo } from 'react';
import { PageContainer } from '../../design-system/components/PageContainer';
import {
  Users,
  Mail,
  Shield,
  Send
} from 'lucide-react';
import {
  useUsers,
  useInviteUser,
  useReinviteUser,
  useSaveUser,
  useDeleteUser,
  useDeactivateUser,
  useReactivateUser
} from '../../hooks/useUsers';
import { useRoles } from '../../hooks/useRoles';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { PageHeader } from '../../design-system/components/PageHeader';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { FilterBar } from '../../design-system/components/FilterBar';
import { Modal } from '../../design-system/components/Modal';
import { useConfirm } from '../../design-system/components/ConfirmDialog';
import { useToast } from '../../design-system/components/Toast';
import { DataTable } from '../../design-system/components/DataTable';
import { AppInput, AppSelect } from '../../design-system/components/FormFields';
import { AdminListShell } from './shared/AdminListShell';
import type { SystemUser, UserRole } from '../../types/user';
import {
  getPerfilDisplayLabel,
  GESTOR_SALDO_ROLE_ID,
  GESTOR_SALDO_PERMISSIONS_DESCRIPTION
} from '../../types/user';

export const UsersManagement: React.FC = () => {
  const { data: users = [], isLoading } = useUsers();
  const { data: roles = [] } = useRoles();
  const inviteUserMutation = useInviteUser();
  const reinviteUserMutation = useReinviteUser();
  const saveUserMutation = useSaveUser();
  const deleteUserMutation = useDeleteUser();
  const deactivateUserMutation = useDeactivateUser();
  const reactivateUserMutation = useReactivateUser();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);

  // Form State (Cadastro simplificado: Nome, E-mail, Perfil)
  const [formNome, setFormNome] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPerfil, setFormPerfil] = useState<UserRole>('gestor');
  const [formError, setFormError] = useState<string | null>(null);
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setFormNome('');
    setFormEmail('');
    setFormPerfil('gestor');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (u: SystemUser) => {
    setEditingUser(u);
    setFormNome(u.nome);
    setFormEmail(u.email);
    setFormPerfil(u.perfil);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveOrInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNome.trim() || !formEmail.trim()) {
      setFormError('Nome e E-mail são obrigatórios.');
      return;
    }

    // Gestor de Saldo é global no domínio de alocações (administra todas as
    // Atas) — nenhum escopo individual é configurado ou enviado para ele.
    if (editingUser) {
      // Edição de usuário existente
      saveUserMutation.mutate(
        {
          user: {
            id: editingUser.id,
            nome: formNome.trim(),
            email: formEmail.trim(),
            perfil: formPerfil,
            matricula: editingUser.matricula,
            cargo: editingUser.cargo,
            departamento: editingUser.departamento,
            ativo: editingUser.ativo
          }
        },
        {
          onSuccess: () => {
            setIsModalOpen(false);
            toast.success(`Usuário "${formNome}" atualizado com sucesso.`);
          },
          onError: (err: any) => {
            setFormError(err.message || 'Erro ao atualizar dados do servidor.');
          }
        }
      );
    } else {
      // Criação de novo usuário pelo fluxo oficial de convite do Supabase Auth
      inviteUserMutation.mutate(
        {
          nome: formNome.trim(),
          email: formEmail.trim(),
          perfil: formPerfil
        },
        {
          onSuccess: () => {
            setIsModalOpen(false);
            toast.success(`Convite oficial enviado com sucesso para ${formEmail.trim()}.`);
          },
          onError: (err: any) => {
            setFormError(err.message || 'Erro ao convidar servidor.');
          }
        }
      );
    }
  };

  const handleReinvite = (user: SystemUser) => {
    reinviteUserMutation.mutate(
      {
        email: user.email,
        nome: user.nome,
        perfil: user.perfil
      },
      {
        onSuccess: () => {
          toast.success(`Convite reenviado com sucesso para ${user.email}.`);
        },
        onError: (err: any) => {
          toast.error(err.message || 'Falha ao reenviar convite.');
        }
      }
    );
  };

  const handleDeactivate = async (user: SystemUser) => {
    const ok = await confirm({
      title: 'Desativar acesso',
      message: `Deseja realmente desativar o acesso de "${user.nome}"? O servidor não conseguirá mais fazer login até ser reativado.`,
      confirmLabel: 'Desativar',
      tone: 'danger'
    });
    if (!ok) return;
    deactivateUserMutation.mutate(user, {
      onSuccess: () => toast.success(`Acesso de "${user.nome}" desativado com sucesso.`),
      onError: (err: any) => toast.error(err.message || 'Falha ao desativar o acesso do servidor.')
    });
  };

  const handleReactivate = (user: SystemUser) => {
    reactivateUserMutation.mutate(user, {
      onSuccess: () => {
        toast.success(`Acesso de "${user.nome}" reativado com sucesso.`);
      },
      onError: (err: any) => {
        toast.error(err.message || 'Falha ao reativar o acesso do servidor.');
      }
    });
  };

  const handleDelete = async (user: SystemUser) => {
    if (user.status !== 'pendente') {
      toast.error('Servidores ativos ou já cadastrados não podem ser excluídos por exigência de auditoria pública. Utilize a opção de desativação.');
      return;
    }

    const ok = await confirm({
      title: 'Cancelar convite',
      message: `Deseja realmente cancelar e excluir o convite pendente para "${user.nome || user.email}"?`,
      confirmLabel: 'Excluir convite',
      tone: 'danger'
    });
    if (!ok) return;
    deleteUserMutation.mutate(user, {
      onSuccess: () => toast.success(`Convite para "${user.nome || user.email}" cancelado com sucesso.`),
      onError: (err: any) => toast.error(err.message || 'Falha ao cancelar o convite.')
    });
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        u.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.cargo && u.cargo.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (u.departamento && u.departamento.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchRole = filterRole === 'todos' || u.perfil === filterRole;
      return matchSearch && matchRole;
    });
  }, [users, searchTerm, filterRole]);

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 1. Header Padronizado */}
      <PageHeader
        title="Usuários e Servidores"
        subtitle="Cadastro de servidores, atribuição de competências operacionais e credenciamento de gestores da pasta"
        icon={<Users size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <ActionButton
            action="novo"
            label="Novo Servidor"
            onClick={handleOpenCreateModal}
            data-testid="create-user-btn"
          />
        }
      />

      {/* Filtros */}
      <div>
        <FilterBar
          testId="users-filter-bar"
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por nome ou e-mail..."
          selects={[
            {
              id: 'users-filter-role-select',
              label: 'Perfil',
              value: filterRole,
              onChange: setFilterRole,
              options: [{ value: 'todos', label: `Todos os Perfis (${roles.length})` }, ...roles.map((r) => ({ value: r.id, label: r.nome }))]
            }
          ]}
          hasActiveFilters={Boolean(searchTerm) || filterRole !== 'todos'}
          onClearFilters={() => {
            setSearchTerm('');
            setFilterRole('todos');
          }}
        />
        <div data-testid="users-counter" style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', margin: '0.5rem 0.25rem 0' }}>
          {filteredUsers.length === users.length
            ? `${users.length} ${users.length === 1 ? 'usuário' : 'usuários'}`
            : `${filteredUsers.length} de ${users.length} usuários`}
        </div>
      </div>

      {/* 3. Tabela de Usuários */}
      <AdminListShell
        testId="users-table-container"
        title="Servidores e usuários"
        countLabel={filteredUsers.length === users.length ? String(users.length) : `${filteredUsers.length} de ${users.length}`}
        isLoading={isLoading}
        isEmpty={filteredUsers.length === 0}
        emptyTitle="Nenhum usuário encontrado"
        emptyDescription="Nenhum servidor ou usuário corresponde aos filtros aplicados."
      >
        <DataTable<SystemUser>
          testId="users-table"
          className="data-table-container--flush"
          data={filteredUsers}
          keyExtractor={(u) => String(u.id)}
          columns={[
            {
              key: 'nome',
              header: 'Servidor / Usuário',
              sortValue: (user) => user.nome,
              priority: 'primary',
              render: (user) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{user.nome}</span>
                  <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Mail size={12} /> {user.email}
                  </span>
                </div>
              )
            },
            {
              key: 'perfil',
              header: 'Perfil operacional',
              sortValue: (user) => getPerfilDisplayLabel(user.perfil, roles),
              mobileLabel: 'Perfil',
              render: (user) => {
                const roleObj = roles.find((r) => r.id === user.perfil);
                const color = roleObj?.badgeColor || '#0c326f';
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span
                      title={user.perfil === GESTOR_SALDO_ROLE_ID ? `Permissões: ${GESTOR_SALDO_PERMISSIONS_DESCRIPTION.join(', ')}` : undefined}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '6px',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        width: 'fit-content',
                        color,
                        background: `${color}15`,
                        border: `1px solid ${color}30`
                      }}
                    >
                      <Shield size={12} />
                      {getPerfilDisplayLabel(user.perfil, roles)}
                    </span>
                  </div>
                );
              }
            },
            {
              key: 'situacao',
              header: 'Situação',
              align: 'center',
              sortValue: (user) => (user.status === 'pendente' ? 'Convite pendente' : user.status === 'inativo' || user.ativo === false ? 'Inativo' : 'Ativo'),
              render: (user) => {
                const isInactive = user.status === 'inativo' || user.ativo === false;
                return user.status === 'pendente' ? (
                  <StatusBadge variant="warning" label="Convite pendente" />
                ) : isInactive ? (
                  <StatusBadge variant="neutral" label="Inativo" />
                ) : (
                  <StatusBadge variant="success" label="Ativo" />
                );
              }
            }
          ]}
          rowActions={(user) => {
            const isPending = user.status === 'pendente';
            const isInactive = user.status === 'inativo' || user.ativo === false;
            return (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {isPending && (
                  <AppButton
                    variant="outline"
                    size="sm"
                    icon={<Send size={13} />}
                    onClick={() => handleReinvite(user)}
                    disabled={reinviteUserMutation.isPending}
                    title="Reenviar convite por e-mail"
                  >
                    Reenviar convite
                  </AppButton>
                )}
                <ActionButton action="editar" size="sm" onClick={() => handleOpenEditModal(user)} title="Editar servidor" />
                {isInactive ? (
                  <ActionButton
                    action="reativar"
                    size="sm"
                    onClick={() => handleReactivate(user)}
                    disabled={reactivateUserMutation.isPending}
                    title="Reativar acesso do servidor"
                  />
                ) : !isPending ? (
                  <ActionButton
                    action="desativar"
                    iconOnly
                    label={`Desativar acesso de ${user.nome}`}
                    onClick={() => handleDeactivate(user)}
                    disabled={deactivateUserMutation.isPending}
                  />
                ) : null}
                {isPending && (
                  <ActionButton
                    action="excluir"
                    iconOnly
                    label={`Cancelar e excluir convite de ${user.nome}`}
                    onClick={() => handleDelete(user)}
                    disabled={deleteUserMutation.isPending}
                  />
                )}
              </div>
            );
          }}
        />
      </AdminListShell>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? 'Editar servidor' : 'Novo servidor'}
        size="md"
        testId="user-modal"
        footer={
          <>
            <ActionButton action="cancelar" type="button" onClick={() => setIsModalOpen(false)} />
            <AppButton type="submit" form="user-form" isLoading={inviteUserMutation.isPending || saveUserMutation.isPending}>
              {editingUser
                ? (saveUserMutation.isPending ? 'Salvando...' : 'Salvar alterações')
                : (inviteUserMutation.isPending ? 'Enviando convite...' : 'Criar e convidar servidor')}
            </AppButton>
          </>
        }
      >
            <form id="user-form" onSubmit={handleSaveOrInvite} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {formError && (
                <div style={{ padding: '0.65rem 0.85rem', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: '6px', color: 'var(--color-danger-text-strong)', fontSize: '0.8rem', fontWeight: 600 }}>
                  {formError}
                </div>
              )}

              <AppInput
                label="Nome"
                type="text"
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                placeholder="Nome completo do servidor"
                required
              />
              <AppInput
                label="E-mail institucional"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="servidor@mj.gov.br"
                required
              />
              <AppSelect label="Perfil operacional" value={formPerfil} onChange={(e) => setFormPerfil(e.target.value as UserRole)}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </AppSelect>

            </form>
      </Modal>
      {dialog}
    </PageContainer>
  );
};
