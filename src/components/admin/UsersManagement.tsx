import React, { useState, useMemo } from 'react';
import { PageContainer } from '../../design-system/components/PageContainer';
import {
  UserPlus,
  Users,
  Edit2,
  UserX,
  UserCheck,
  Mail,
  Shield,
  Send,
  Trash2
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
import { PageHeader } from '../../design-system/components/PageHeader';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { EmptyState } from '../../design-system/components/EmptyState';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { FilterBar } from '../../design-system/components/FilterBar';
import { Modal } from '../../design-system/components/Modal';
import { useConfirm } from '../../design-system/components/ConfirmDialog';
import { useToast } from '../../design-system/components/Toast';
import { carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
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

  const isGestorSaldoSelecionado = formPerfil === GESTOR_SALDO_ROLE_ID;

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
        icon={<Users size={26} color="#0c326f" aria-hidden="true" />}
        actions={
          <AppButton
            variant="primary"
            onClick={handleOpenCreateModal}
            data-testid="create-user-btn"
            icon={<UserPlus size={15} />}
          >
            Novo Servidor
          </AppButton>
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
      <div data-testid="users-table-container" style={carteiraTableShell}>
        {isLoading ? (
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <SkeletonLoader variant="card" height="48px" />
            <SkeletonLoader variant="card" height="48px" />
            <SkeletonLoader variant="card" height="48px" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ padding: '3rem 1.5rem' }}>
            <EmptyState
              title="Nenhum usuário encontrado"
              description="Nenhum servidor ou usuário corresponde aos filtros aplicados."
            />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={carteiraTh}>Servidor / Usuário</th>
                  <th style={carteiraTh}>Perfil operacional</th>
                  <th style={{ ...carteiraTh, textAlign: 'center' }}>Situação</th>
                  <th style={{ ...carteiraTh, textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const roleObj = roles.find((r) => r.id === user.perfil);
                  const isPending = user.status === 'pendente';
                  const isInactive = user.status === 'inativo' || user.ativo === false;

                  return (
                    <tr key={user.id}>
                      {/* Servidor / Usuário */}
                      <td style={carteiraTd}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>{user.nome}</span>
                          </div>
                          <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Mail size={12} /> {user.email}
                          </span>
                        </div>
                      </td>

                      {/* Perfil Operacional */}
                      <td style={carteiraTd}>
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
                              color: roleObj?.badgeColor || '#0c326f',
                              background: `${roleObj?.badgeColor || '#0c326f'}15`,
                              border: `1px solid ${roleObj?.badgeColor || '#0c326f'}30`
                            }}
                          >
                            <Shield size={12} />
                            {getPerfilDisplayLabel(user.perfil, roles)}
                          </span>
                          {user.perfil === GESTOR_SALDO_ROLE_ID && (
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              Todas as Atas
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status Derivado da Autenticação */}
                      <td style={{ ...carteiraTd, textAlign: 'center' }}>
                        {isPending ? (
                          <StatusBadge variant="warning" label="Convite pendente" />
                        ) : isInactive ? (
                          <StatusBadge variant="neutral" label="Inativo" />
                        ) : (
                          <StatusBadge variant="success" label="Ativo" />
                        )}
                      </td>

                      {/* Ações */}
                      <td style={{ ...carteiraTd, textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                          {isPending && (
                            <button
                              type="button"
                              onClick={() => handleReinvite(user)}
                              disabled={reinviteUserMutation.isPending}
                              title="Reenviar convite por e-mail"
                              style={{
                                padding: '0.35rem 0.6rem',
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                borderRadius: '4px',
                                color: '#1d4ed8',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontSize: '0.76rem',
                                fontWeight: 600
                              }}
                            >
                              <Send size={12} /> Reenviar convite
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(user)}
                            title="Editar servidor"
                            style={{
                              padding: '0.35rem 0.6rem',
                              background: '#f8fafc',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              color: '#0c326f',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontSize: '0.76rem',
                              fontWeight: 600
                            }}
                          >
                            <Edit2 size={13} /> Editar
                          </button>
                          {isInactive ? (
                            <button
                              type="button"
                              onClick={() => handleReactivate(user)}
                              disabled={reactivateUserMutation.isPending}
                              title="Reativar acesso do servidor"
                              style={{
                                padding: '0.35rem 0.6rem',
                                background: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                borderRadius: '4px',
                                color: '#166534',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontSize: '0.76rem',
                                fontWeight: 600
                              }}
                            >
                              <UserCheck size={13} /> Reativar
                            </button>
                          ) : !isPending ? (
                            <button
                              type="button"
                              onClick={() => handleDeactivate(user)}
                              disabled={deactivateUserMutation.isPending}
                              title="Desativar acesso do servidor"
                              style={{
                                padding: '0.35rem 0.5rem',
                                background: '#fff1f2',
                                border: '1px solid #fecdd3',
                                borderRadius: '4px',
                                color: '#e11d48',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center'
                              }}
                            >
                              <UserX size={13} />
                            </button>
                          ) : null}
                          {isPending && (
                            <button
                              type="button"
                              onClick={() => handleDelete(user)}
                              disabled={deleteUserMutation.isPending}
                              title="Cancelar e excluir convite pendente"
                              style={{
                                padding: '0.35rem 0.5rem',
                                background: '#fff1f2',
                                border: '1px solid #fecdd3',
                                borderRadius: '4px',
                                color: '#e11d48',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center'
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? 'Editar servidor' : 'Novo servidor'}
        size="md"
        testId="user-modal"
        footer={
          <>
            <AppButton type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </AppButton>
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
                <div style={{ padding: '0.65rem 0.85rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#991b1b', fontSize: '0.8rem', fontWeight: 600 }}>
                  {formError}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  Nome
                </label>
                <input
                  type="text"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  placeholder="Nome completo do servidor"
                  required
                  style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  E-mail institucional
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="servidor@mj.gov.br"
                  required
                  style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  Perfil operacional
                </label>
                <select
                  value={formPerfil}
                  onChange={(e) => setFormPerfil(e.target.value as UserRole)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600 }}
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </select>
              </div>

              {isGestorSaldoSelecionado && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: '0.85rem', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '8px' }}>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#0f766e', fontWeight: 700 }}>
                    Gestor de Saldo
                  </p>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#0f766e' }}>
                    Gerencia as alocações internas de todas as Atas.
                  </p>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                    Permissões: {GESTOR_SALDO_PERMISSIONS_DESCRIPTION.join(', ')}. Nenhum acesso a contratos, financeiro, departamentos ou administração do sistema.
                  </p>
                </div>
              )}

            </form>
      </Modal>
      {dialog}
    </PageContainer>
  );
};
