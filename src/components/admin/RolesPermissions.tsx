import React, { useState } from 'react';
import {
  KeyRound,
  Shield,
  Check,
  X,
  UserCheck,
  Eye,
  Plus,
  Edit2,
  Trash2,
  Sparkles,
  CheckSquare,
  Square
} from 'lucide-react';
import { type RoleDefinition, type RolePermissions } from '../../types/user';
import { useRoles, useSaveRole, useDeleteRole } from '../../hooks/useRoles';

const PERMISSION_DEFINITIONS: { key: keyof RolePermissions; label: string; desc: string }[] = [
  {
    key: 'visualizarTodosContratos',
    label: 'Visualizar Todos os Contratos e Atas',
    desc: 'Permite consultar o acervo completo de atas e contratos da UASG 200331.'
  },
  {
    key: 'distribuirContratos',
    label: 'Distribuir e Atribuir Gestão de Contratos',
    desc: 'Designar servidores responsáveis pela fiscalização e gestão de contratos.'
  },
  {
    key: 'editarTarefasContratuais',
    label: 'Editar Checklist e Tarefas de Fiscalização',
    desc: 'Preencher prazos, marcar tarefas concluídas e registrar observações operacionais.'
  },
  {
    key: 'aplicarTemplates',
    label: 'Aplicar Planos de Gestão / Templates',
    desc: 'Vincular planos de acompanhamento padronizados aos contratos.'
  },
  {
    key: 'gerenciarDepartamentos',
    label: 'Gerenciar e Unificar Departamentos',
    desc: 'Cadastrar, renomear e mesclar unidades requisitantes e cotas internas.'
  },
  {
    key: 'exportarRelatorios',
    label: 'Exportar Relatórios Parametrizados Excel',
    desc: 'Gerar planilhas consolidadas de saldos, atas, adesões e contratos.'
  },
  {
    key: 'gerenciarUsuarios',
    label: 'Administrar Usuários e Perfis',
    desc: 'Cadastrar novos operadores, atribuir papéis e controlar acessos ao sistema.'
  }
];

const PRESET_COLORS = [
  '#0c326f',
  '#0284c7',
  '#059669',
  '#7c3aed',
  '#d97706',
  '#e11d48',
  '#475569'
];

export const RolesPermissions: React.FC = () => {
  const { data: roles = [] } = useRoles();
  const saveRoleMutation = useSaveRole();
  const deleteRoleMutation = useDeleteRole();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleDefinition | null>(null);

  // Form State
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [badgeColor, setBadgeColor] = useState('#0c326f');
  const [permissoes, setPermissoes] = useState<RolePermissions>({
    distribuirContratos: false,
    editarTarefasContratuais: true,
    aplicarTemplates: false,
    gerenciarDepartamentos: false,
    exportarRelatorios: true,
    visualizarTodosContratos: true,
    gerenciarUsuarios: false
  });

  const handleOpenCreateModal = () => {
    setEditingRole(null);
    setNome('');
    setDescricao('');
    setBadgeColor('#7c3aed');
    setPermissoes({
      distribuirContratos: false,
      editarTarefasContratuais: true,
      aplicarTemplates: false,
      gerenciarDepartamentos: false,
      exportarRelatorios: true,
      visualizarTodosContratos: true,
      gerenciarUsuarios: false
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (role: RoleDefinition) => {
    setEditingRole(role);
    setNome(role.nome);
    setDescricao(role.descricao);
    setBadgeColor(role.badgeColor);
    setPermissoes({ ...role.permissoes });
    setIsModalOpen(true);
  };

  const handleTogglePermission = (key: keyof RolePermissions) => {
    setPermissoes(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;

    saveRoleMutation.mutate(
      {
        id: editingRole ? editingRole.id : undefined,
        nome: nome.trim(),
        descricao: descricao.trim(),
        badgeColor,
        permissoes
      },
      {
        onSuccess: () => {
          setIsModalOpen(false);
        }
      }
    );
  };

  const handleDelete = (id: string, roleNome: string) => {
    if (window.confirm(`Deseja realmente remover o perfil customizado "${roleNome}"?`)) {
      deleteRoleMutation.mutate(id);
    }
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem 0', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Cabeçalho da Página */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '1.5rem 2rem',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        borderLeft: '5px solid #0c326f'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.65rem', background: '#eff6ff', borderRadius: '10px', color: '#0c326f' }}>
            <KeyRound size={26} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0, paddingBottom: 0, borderBottom: 'none' }}>
              Matriz de Perfis e Permissões
            </h1>
            <p style={{ fontSize: '0.86rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
              Definição dos níveis de acesso, escopos operacionais e regras de governança do ComprasSUSP
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="btn btn-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 1.1rem',
            fontSize: '0.88rem',
            fontWeight: 700,
            borderRadius: '8px'
          }}
        >
          <Plus size={18} />
          <span>Novo Perfil</span>
        </button>
      </div>

      {/* Cards de Perfis */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {roles.map((role) => {
          const isCoordenador = role.id === 'coordenador';
          const isGestor = role.id === 'gestor';
          const isConsulta = role.id === 'consulta';

          return (
            <div
              key={role.id}
              style={{
                background: '#ffffff',
                borderRadius: '10px',
                padding: '1.25rem',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                borderTop: `4px solid ${role.badgeColor}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: role.badgeColor,
                      background: `${role.badgeColor}15`,
                      padding: '0.2rem 0.55rem',
                      borderRadius: '6px'
                    }}>
                      {role.isCustom ? 'Perfil Customizado' : 'Perfil Nativo'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(role)}
                      title="Editar Perfil"
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        padding: '0.3rem',
                        color: '#475569',
                        cursor: 'pointer'
                      }}
                    >
                      <Edit2 size={13} />
                    </button>

                    {role.isCustom && (
                      <button
                        type="button"
                        onClick={() => handleDelete(role.id, role.nome)}
                        title="Remover Perfil"
                        style={{
                          background: '#fff1f2',
                          border: '1px solid #fecdd3',
                          borderRadius: '6px',
                          padding: '0.3rem',
                          color: '#e11d48',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem' }}>
                  {isCoordenador ? (
                    <Shield size={20} color={role.badgeColor} />
                  ) : isGestor ? (
                    <UserCheck size={20} color={role.badgeColor} />
                  ) : isConsulta ? (
                    <Eye size={20} color={role.badgeColor} />
                  ) : (
                    <Sparkles size={20} color={role.badgeColor} />
                  )}
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    {role.nome}
                  </h3>
                </div>

                <p style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.45, margin: '0.6rem 0 1rem 0' }}>
                  {role.descricao}
                </p>
              </div>

              <div style={{
                paddingTop: '0.75rem',
                borderTop: '1px solid #f1f5f9',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span>Escopo Contratual:</span>
                <span style={{ color: role.badgeColor }}>
                  {role.permissoes.visualizarTodosContratos
                    ? role.permissoes.distribuirContratos
                      ? 'Global & Distribuição'
                      : 'Todos os Contratos'
                    : 'Apenas Atribuídos'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabela Comparativa de Permissões */}
      <section style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '1.5rem',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Matriz Detalhada de Funcionalidades
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
            Comparativo direto de ações autorizadas por perfil no fluxo operacional do ComprasSUSP
          </p>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '0.85rem 1rem', fontWeight: 700, color: '#334155' }}>
                  Funcionalidade / Operação
                </th>
                {roles.map((r) => (
                  <th key={r.id} style={{ textAlign: 'center', padding: '0.85rem 1rem', fontWeight: 800, color: r.badgeColor, minWidth: '140px' }}>
                    {r.nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_DEFINITIONS.map((perm, idx) => (
                <tr
                  key={perm.key}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    background: idx % 2 === 0 ? '#ffffff' : '#fafafa'
                  }}
                >
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{perm.label}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>{perm.desc}</div>
                  </td>

                  {roles.map((r) => {
                    const isAllowed = r.permissoes[perm.key];
                    return (
                      <td key={r.id} style={{ textAlign: 'center', padding: '0.85rem 1rem' }}>
                        {isAllowed ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            background: '#dcfce7',
                            color: '#15803d'
                          }}>
                            <Check size={15} strokeWidth={3} />
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            background: '#f1f5f9',
                            color: '#94a3b8'
                          }}>
                            <X size={15} strokeWidth={2} />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* MODAL DE CRIAÇÃO / EDIÇÃO DE PERFIL */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '650px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e2e8f0'
          }}>
            {/* Header Modal */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8fafc'
            }}>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  {editingRole ? `Editar Perfil: ${editingRole.nome}` : 'Criar Novo Perfil de Acesso'}
                </h2>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
                  Defina o nome, identificação visual e matriz de permissões deste perfil
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '0.4rem',
                  borderRadius: '6px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  Nome do Perfil *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Fiscal Técnico Setorial"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    fontSize: '0.88rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  Descrição e Finalidade
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Responsável pela validação técnica de entregáveis e medições contratuais."
                  value={descricao}
                  onChange={e => setDescricao(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    fontSize: '0.85rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.45rem' }}>
                  Cor Temática do Perfil
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {PRESET_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setBadgeColor(color)}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: color,
                        border: badgeColor === color ? '3px solid #0f172a' : '2px solid #ffffff',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        cursor: 'pointer'
                      }}
                    />
                  ))}
                  <input
                    type="color"
                    value={badgeColor}
                    onChange={e => setBadgeColor(e.target.value)}
                    title="Escolher cor personalizada"
                    style={{
                      width: '32px',
                      height: '32px',
                      padding: 0,
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Matriz de Permissões no Modal */}
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.6rem' }}>
                  Permissões de Acesso Concedidas:
                </label>
                <div style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  padding: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem'
                }}>
                  {PERMISSION_DEFINITIONS.map(perm => {
                    const isChecked = permissoes[perm.key];
                    return (
                      <div
                        key={perm.key}
                        onClick={() => handleTogglePermission(perm.key)}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.65rem',
                          padding: '0.5rem 0.6rem',
                          background: '#ffffff',
                          border: isChecked ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ marginTop: '0.1rem', color: isChecked ? '#0284c7' : '#94a3b8' }}>
                          {isChecked ? <CheckSquare size={18} /> : <Square size={18} />}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                            {perm.label}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.1rem' }}>
                            {perm.desc}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Ações do Modal */}
              <div style={{
                marginTop: '0.5rem',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem'
              }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveRoleMutation.isPending || !nome.trim()}
                  className="btn btn-primary"
                  style={{
                    padding: '0.55rem 1.3rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    background: badgeColor,
                    borderColor: badgeColor
                  }}
                >
                  {saveRoleMutation.isPending ? 'Salvando...' : editingRole ? 'Atualizar Perfil' : 'Criar Perfil'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
