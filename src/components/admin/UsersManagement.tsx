import React, { useState, useMemo } from 'react';
import { Users, UserPlus, Search, Edit2, Trash2, CheckCircle2, XCircle, Shield, UserCheck, Eye, Mail, Building, Briefcase } from 'lucide-react';
import { useUsers, useSaveUser, useDeleteUser } from '../../hooks/useUsers';
import { useRoles } from '../../hooks/useRoles';
import type { SystemUser, UserRole } from '../../types/user';

export const UsersManagement: React.FC = () => {
  const { data: users = [], isLoading } = useUsers();
  const { data: roles = [] } = useRoles();
  const saveUserMutation = useSaveUser();
  const deleteUserMutation = useDeleteUser();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);

  // Form State
  const [formNome, setFormNome] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formMatricula, setFormMatricula] = useState('');
  const [formCargo, setFormCargo] = useState('');
  const [formDepartamento, setFormDepartamento] = useState('');
  const [formPerfil, setFormPerfil] = useState<UserRole>('gestor');
  const [formAtivo, setFormAtivo] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setFormNome('');
    setFormEmail('');
    setFormMatricula('');
    setFormCargo('Analista / Especialista');
    setFormDepartamento('SENASP / MJSP');
    setFormPerfil('gestor');
    setFormAtivo(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (u: SystemUser) => {
    setEditingUser(u);
    setFormNome(u.nome);
    setFormEmail(u.email);
    setFormMatricula(u.matricula || '');
    setFormCargo(u.cargo || '');
    setFormDepartamento(u.departamento || '');
    setFormPerfil(u.perfil);
    setFormAtivo(u.ativo);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNome.trim() || !formEmail.trim()) {
      setFormError('Nome e E-mail são obrigatórios.');
      return;
    }

    saveUserMutation.mutate({
      id: editingUser?.id,
      nome: formNome,
      email: formEmail,
      matricula: formMatricula,
      cargo: formCargo,
      departamento: formDepartamento,
      perfil: formPerfil,
      ativo: formAtivo
    }, {
      onSuccess: () => {
        setIsModalOpen(false);
      },
      onError: (err: any) => {
        setFormError(err.message || 'Erro ao salvar usuário.');
      }
    });
  };

  const handleDelete = (id: string, nome: string) => {
    if (window.confirm(`Deseja realmente remover o usuário "${nome}"?`)) {
      deleteUserMutation.mutate(id);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch = (
        u.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.cargo && u.cargo.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (u.departamento && u.departamento.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      const matchRole = filterRole === 'todos' || u.perfil === filterRole;
      return matchSearch && matchRole;
    });
  }, [users, searchTerm, filterRole]);

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem 0', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      
      {/* Cabeçalho */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '1.5rem 2rem',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        borderLeft: '5px solid #0c326f'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.65rem', background: '#eff6ff', borderRadius: '10px', color: '#0c326f' }}>
            <Users size={26} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0, paddingBottom: 0, borderBottom: 'none' }}>
              Gestão de Usuários e Servidores
            </h1>
            <p style={{ fontSize: '0.86rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
              Cadastro de servidores, atribuição de papéis e designação de gestores na pasta
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 1.1rem',
            background: '#0c326f',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(12, 50, 111, 0.2)'
          }}
        >
          <UserPlus size={16} /> Novo Servidor / Usuário
        </button>
      </div>

      {/* Barra de Filtros e Busca */}
      <div style={{
        background: '#ffffff',
        borderRadius: '10px',
        padding: '1rem 1.25rem',
        border: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: '1 1 300px', maxWidth: '500px' }}>
          <Search size={16} color="#64748b" />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail, cargo ou unidade..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.45rem 0.75rem',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '0.84rem'
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>Filtrar Perfil:</span>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            style={{
              padding: '0.45rem 0.75rem',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer'
            }}
          >
            <option value="todos">Todos os Perfis ({roles.length})</option>
            {roles.map(r => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabela de Usuários */}
      <section style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '0.9rem 1.25rem', fontWeight: 700, color: '#334155' }}>
                  Servidor / E-mail
                </th>
                <th style={{ textAlign: 'left', padding: '0.9rem 1rem', fontWeight: 700, color: '#334155' }}>
                  Cargo & Unidade
                </th>
                <th style={{ textAlign: 'center', padding: '0.9rem 1rem', fontWeight: 700, color: '#334155' }}>
                  Perfil de Acesso
                </th>
                <th style={{ textAlign: 'center', padding: '0.9rem 1rem', fontWeight: 700, color: '#334155' }}>
                  Status
                </th>
                <th style={{ textAlign: 'right', padding: '0.9rem 1.25rem', fontWeight: 700, color: '#334155' }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
                    Carregando servidores do sistema...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
                    Nenhum servidor encontrado para os filtros informados.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u, idx) => {
                  const roleDef = roles.find(r => r.id === u.perfil);

                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: idx % 2 === 0 ? '#ffffff' : '#fafafa'
                      }}
                    >
                      <td style={{ padding: '0.9rem 1.25rem' }}>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.88rem' }}>
                          {u.nome}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                          <Mail size={12} /> {u.email}
                          {u.matricula && <span style={{ opacity: 0.8 }}>• Matrícula: {u.matricula}</span>}
                        </div>
                      </td>

                      <td style={{ padding: '0.9rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Briefcase size={13} color="#64748b" /> {u.cargo || 'Servidor Público'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                          <Building size={12} /> {u.departamento || 'SENASP / MJSP'}
                        </div>
                      </td>

                      <td style={{ textAlign: 'center', padding: '0.9rem 1rem' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          padding: '0.2rem 0.6rem',
                          borderRadius: '999px',
                          background: `${roleDef?.badgeColor || '#0c326f'}15`,
                          color: roleDef?.badgeColor || '#0c326f'
                        }}>
                          {u.perfil === 'coordenador' ? <Shield size={12} /> : u.perfil === 'gestor' ? <UserCheck size={12} /> : <Eye size={12} />}
                          {roleDef?.nome || u.perfil}
                        </span>
                      </td>

                      <td style={{ textAlign: 'center', padding: '0.9rem 1rem' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '999px',
                          background: u.ativo ? '#dcfce7' : '#f1f5f9',
                          color: u.ativo ? '#15803d' : '#94a3b8'
                        }}>
                          {u.ativo ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                          {u.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right', padding: '0.9rem 1.25rem' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(u)}
                            title="Editar servidor"
                            style={{
                              padding: '0.35rem',
                              background: '#f8fafc',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: '#0c326f'
                            }}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(u.id, u.nome)}
                            title="Remover servidor"
                            style={{
                              padding: '0.35rem',
                              background: '#fff1f2',
                              border: '1px solid #fecdd3',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: '#e11d48'
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal de Criação / Edição de Usuário */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '560px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                {editingUser ? 'Editar Servidor / Usuário' : 'Novo Servidor / Usuário'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '1.2rem', fontWeight: 700 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {formError && (
                <div style={{ padding: '0.6rem 0.85rem', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '6px', color: '#b91c1c', fontSize: '0.8rem' }}>
                  {formError}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  placeholder="Ex: Carlos Eduardo da Silva"
                  style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                    E-mail Institucional *
                  </label>
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="carlos.silva@mj.gov.br"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                    Matrícula SIAPE
                  </label>
                  <input
                    type="text"
                    value={formMatricula}
                    onChange={(e) => setFormMatricula(e.target.value)}
                    placeholder="Ex: 1984201"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                    Cargo / Função
                  </label>
                  <input
                    type="text"
                    value={formCargo}
                    onChange={(e) => setFormCargo(e.target.value)}
                    placeholder="Ex: Analista de Planejamento"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                    Departamento / Unidade
                  </label>
                  <input
                    type="text"
                    value={formDepartamento}
                    onChange={(e) => setFormDepartamento(e.target.value)}
                    placeholder="Ex: CGLIC / SENASP"
                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
                  Perfil de Acesso (Papel Institucional) *
                </label>
                <select
                  value={formPerfil}
                  onChange={(e) => setFormPerfil(e.target.value as UserRole)}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600 }}
                >
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.nome} ({r.descricao.slice(0, 50)}...)
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <input
                  type="checkbox"
                  id="user-ativo-check"
                  checked={formAtivo}
                  onChange={(e) => setFormAtivo(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="user-ativo-check" style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                  Usuário Ativo no Sistema
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveUserMutation.isPending}
                  style={{
                    padding: '0.5rem 1.25rem',
                    background: '#0c326f',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    cursor: 'pointer'
                  }}
                >
                  {saveUserMutation.isPending ? 'Salvando...' : 'Salvar Servidor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
