import React, { useState, useMemo } from 'react';
import {
  UserPlus,
  Users,
  Search,
  Filter,
  Edit2,
  UserX,
  UserCheck,
  Mail,
  Shield,
  RotateCcw,
  XCircle,
  X,
  Send,
  Trash2,
  CheckCircle2
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
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
            setToastMessage(`Usuário "${formNome}" atualizado com sucesso.`);
            setTimeout(() => setToastMessage(null), 4000);
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
            setToastMessage(`Convite oficial enviado com sucesso para ${formEmail.trim()}.`);
            setTimeout(() => setToastMessage(null), 5000);
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
          setToastMessage(`Convite reenviado com sucesso para ${user.email}.`);
          setTimeout(() => setToastMessage(null), 4000);
        },
        onError: (err: any) => {
          alert(err.message || 'Falha ao reenviar convite.');
        }
      }
    );
  };

  const handleDeactivate = (user: SystemUser) => {
    if (window.confirm(`Deseja realmente desativar o acesso de "${user.nome}"? O servidor não conseguirá mais fazer login até ser reativado.`)) {
      deactivateUserMutation.mutate(user, {
        onSuccess: () => {
          setToastMessage(`Acesso de "${user.nome}" desativado com sucesso.`);
          setTimeout(() => setToastMessage(null), 4000);
        },
        onError: (err: any) => {
          alert(err.message || 'Falha ao desativar o acesso do servidor.');
        }
      });
    }
  };

  const handleReactivate = (user: SystemUser) => {
    reactivateUserMutation.mutate(user, {
      onSuccess: () => {
        setToastMessage(`Acesso de "${user.nome}" reativado com sucesso.`);
        setTimeout(() => setToastMessage(null), 4000);
      },
      onError: (err: any) => {
        alert(err.message || 'Falha ao reativar o acesso do servidor.');
      }
    });
  };

  const handleDelete = (user: SystemUser) => {
    if (user.status !== 'pendente') {
      alert('Servidores ativos ou já cadastrados não podem ser excluídos por exigência de auditoria pública. Utilize a opção de desativação.');
      return;
    }

    const confirmMessage = `Deseja realmente cancelar e excluir o convite pendente para "${user.nome || user.email}"?`;

    if (window.confirm(confirmMessage)) {
      deleteUserMutation.mutate(user, {
        onSuccess: () => {
          setToastMessage(`Convite para "${user.nome || user.email}" cancelado com sucesso.`);
          setTimeout(() => setToastMessage(null), 4000);
        },
        onError: (err: any) => {
          alert(err.message || 'Falha ao cancelar o convite.');
        }
      });
    }
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
    <div
      style={{
        maxWidth: '1600px',
        margin: '0 auto',
        padding: '1.5rem 2rem 3rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem'
      }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          padding: '0.75rem 1.25rem',
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '8px',
          color: '#166534',
          fontSize: '0.85rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          boxShadow: '0 2px 5px rgba(0, 0, 0, 0.05)'
        }}>
          <CheckCircle2 size={18} color="#16a34a" />
          <span>{toastMessage}</span>
        </div>
      )}

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

      {/* 2. Barra de Filtros */}
      <div
        data-testid="users-filter-bar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          padding: '0.65rem 0.95rem',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#475569', fontSize: '0.78rem', fontWeight: 700 }}>
            <Filter size={13} color="#64748b" />
            <span>Filtros:</span>
          </div>

          <select
            data-testid="users-filter-role-select"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            style={{
              padding: '0.35rem 0.65rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              fontSize: '0.78rem',
              fontWeight: 600,
              color: '#0f172a',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="todos">Todos os Perfis ({roles.length})</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>

          <div style={{ position: 'relative', minWidth: '240px', flex: '1', maxWidth: '380px' }}>
            <Search
              size={14}
              color="#94a3b8"
              style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }}
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Buscar por nome ou e-mail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.35rem 0.65rem 0.35rem 2rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                fontSize: '0.78rem',
                color: '#0f172a',
                outline: 'none'
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                title="Limpar busca"
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: 0
                }}
              >
                <XCircle size={14} aria-hidden="true" />
              </button>
            )}
          </div>

          {(searchTerm || filterRole !== 'todos') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setFilterRole('todos');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.35rem 0.6rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={12} /> Limpar
            </button>
          )}
        </div>

        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b' }}>
          {filteredUsers.length === users.length
            ? `${users.length} usuários`
            : `${filteredUsers.length} de ${users.length} usuários`}
        </div>
      </div>

      {/* 3. Tabela de Usuários */}
      <div
        data-testid="users-table-container"
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          background: '#ffffff',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
        }}
      >
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
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.78rem', fontWeight: 700 }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Servidor / Usuário</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Perfil Operacional</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const roleObj = roles.find((r) => r.id === user.perfil);
                  const isPending = user.status === 'pendente';
                  const isInactive = user.status === 'inativo' || user.ativo === false;

                  return (
                    <tr
                      key={user.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      {/* Servidor / Usuário */}
                      <td style={{ padding: '0.75rem 1rem' }}>
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
                      <td style={{ padding: '0.75rem 1rem' }}>
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
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              Todas as Atas
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status Derivado da Autenticação */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        {isPending ? (
                          <StatusBadge variant="warning" label="Convite pendente" />
                        ) : isInactive ? (
                          <StatusBadge variant="neutral" label="Inativo" />
                        ) : (
                          <StatusBadge variant="success" label="Ativo" />
                        )}
                      </td>

                      {/* Ações */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
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

      {/* Modal Simplificado: Nome + E-mail + Perfil */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
          onClick={() => setIsModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1.1rem 1.5rem',
                borderBottom: '1px solid #e2e8f0',
                background: '#f8fafc'
              }}
            >
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                {editingUser ? 'Editar Servidor' : 'Novo Servidor'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveOrInvite} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                  <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>
                    Permissões: {GESTOR_SALDO_PERMISSIONS_DESCRIPTION.join(', ')}. Nenhum acesso a contratos, financeiro, departamentos ou administração do sistema.
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ padding: '0.55rem 1rem', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={inviteUserMutation.isPending || saveUserMutation.isPending}
                  style={{
                    padding: '0.55rem 1.15rem',
                    background: '#0c326f',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: (inviteUserMutation.isPending || saveUserMutation.isPending) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {editingUser
                    ? (saveUserMutation.isPending ? 'Salvando...' : 'Salvar alterações')
                    : (inviteUserMutation.isPending ? 'Enviando convite...' : 'Criar e convidar servidor')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
