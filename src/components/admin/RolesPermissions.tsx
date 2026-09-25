import React, { useState } from 'react';
import {
  Shield,
  KeyRound,
  Check,
  X,
  UserCheck,
  Eye,
  Plus,
  Edit2,
  Trash2,
  Sparkles,
  CheckSquare,
  Square,
  Lock,
  Layers
} from 'lucide-react';
import {
  type RoleDefinition,
  type RolePermissions,
  type ContractScope,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
  MACROPROCESS_LIST,
  getContractScopeDisplay
} from '../../types/user';
import { useRoles, useSaveRole, useDeleteRole } from '../../hooks/useRoles';
import { AppCard } from '../../design-system/components/AppCard';
import { SectionHeader } from '../../design-system/components/SectionHeader';
import { AppButton } from '../../design-system/components/AppButton';
import { PageHeader } from '../../design-system/components/PageHeader';

const PRESET_COLORS = [
  '#0c326f',
  '#0284c7',
  '#059669',
  '#7c3aed',
  '#d97706',
  '#e11d48',
  '#475569'
];

const SCOPE_OPTIONS: { id: ContractScope; label: string; tag: string; desc: string }[] = [
  {
    id: 'ASSIGNED',
    label: 'Apenas Contratos Atribuídos',
    tag: 'Recomendado para Gestores / Fiscais',
    desc: 'O operador visualiza e executa ações exclusivamente sobre os contratos designados ao seu nome.'
  },
  {
    id: 'GLOBAL',
    label: 'Acesso Global',
    tag: 'Recomendado para Coordenadores / Auditoria',
    desc: 'Visibilidade ampla sobre todo o acervo de atas e contratos da UASG 200331.'
  },
  {
    id: 'UNIT',
    label: 'Unidade / Setorial',
    tag: 'Gestão por Departamento',
    desc: 'Acesso restrito aos contratos vinculados à unidade requisitante ou departamento do servidor.'
  }
];

function getActivePermissionsCount(permissoes: RolePermissions): number {
  return Object.entries(permissoes).filter(
    ([k, v]) => k !== 'contractScope' && k !== 'visualizarTodosContratos' && v === true
  ).length;
}

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
  const [contractScope, setContractScope] = useState<ContractScope>('ASSIGNED');
  const [permissoes, setPermissoes] = useState<RolePermissions>({
    ...DEFAULT_ROLE_PERMISSIONS
  });

  const totalConfigurablePerms = PERMISSION_CATALOG.filter(
    (p) => p.key !== 'visualizarTodosContratos'
  ).length;

  const handleOpenCreateModal = () => {
    setEditingRole(null);
    setNome('');
    setDescricao('');
    setBadgeColor('#7c3aed');
    setContractScope('ASSIGNED');
    setPermissoes({
      ...DEFAULT_ROLE_PERMISSIONS,
      contractScope: 'ASSIGNED',
      visualizarTodosContratos: false
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (role: RoleDefinition) => {
    setEditingRole(role);
    setNome(role.nome);
    setDescricao(role.descricao);
    setBadgeColor(role.badgeColor);
    const scope = role.permissoes.contractScope || 'ASSIGNED';
    setContractScope(scope);
    setPermissoes({
      ...role.permissoes,
      contractScope: scope,
      visualizarTodosContratos: scope === 'GLOBAL'
    });
    setIsModalOpen(true);
  };

  const handleScopeChange = (newScope: ContractScope) => {
    setContractScope(newScope);
    setPermissoes((prev) => ({
      ...prev,
      contractScope: newScope,
      // Sincroniza retrocompatibilidade de visualizarTodosContratos com base no escopo
      visualizarTodosContratos: newScope === 'GLOBAL'
    }));
  };

  const handleTogglePermission = (key: keyof Omit<RolePermissions, 'contractScope'>) => {
    if (key === 'visualizarTodosContratos') {
      // Bloqueado para edição direta: derivado deterministicamente do contractScope
      return;
    }
    setPermissoes((prev) => ({
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
        permissoes: {
          ...permissoes,
          contractScope,
          visualizarTodosContratos: contractScope === 'GLOBAL'
        }
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
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1.5rem 2rem 3rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* Cabeçalho da Página com PageHeader */}
      <PageHeader
        title="Perfis e Permissões"
        subtitle="Definição dos níveis de acesso, escopos operacionais e regras de governança do ComprasSUSP"
        icon={<KeyRound size={26} color="#0c326f" aria-hidden="true" />}
        actions={
          <AppButton
            variant="primary"
            onClick={handleOpenCreateModal}
            icon={<Plus size={18} />}
            data-testid="create-role-btn"
          >
            Novo Perfil
          </AppButton>
        }
      />

      {/* Aviso de Governança e Soberania RBAC */}
      <div style={{
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderLeft: '5px solid #0c326f',
        borderRadius: '8px',
        padding: '1rem 1.25rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.85rem'
      }}>
        <div style={{ color: '#0c326f', marginTop: '0.15rem' }}>
          <Shield size={20} />
        </div>
        <div style={{ fontSize: '0.84rem', color: '#1e3a8a', lineHeight: 1.5 }}>
          <strong>Aviso de Governança Institucional e Soberania RBAC:</strong>
          <p style={{ margin: '0.25rem 0 0 0', color: '#1e40af' }}>
            A matriz exibida nesta tela define o catálogo de perfis operacionais e distribuição de competências no âmbito do ComprasSUSP (UASG 200331). A autoridade estrita de acesso e proteção aos registros reside de forma imutável nas políticas de <strong>Row Level Security (RLS)</strong> e papéis do banco de dados (<em>gestor</em>, <em>authenticated</em>, <em>anon</em>) no Supabase.
          </p>
        </div>
      </div>

      {/* Cards de Perfis */}
      <div
        data-testid="roles-cards-container"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}
      >
        {roles.map((role) => {
          const isCoordenador = role.id === 'coordenador';
          const isGestor = role.id === 'gestor';
          const isConsulta = role.id === 'consulta';
          const scopeInfo = getContractScopeDisplay(role.permissoes.contractScope, isConsulta);
          const activeCount = getActivePermissionsCount(role.permissoes);

          return (
            <AppCard
              key={role.id}
              className="role-card"
              data-testid={`role-card-${role.id}`}
              style={{
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
                      title={`Editar Perfil ${role.nome}`}
                      data-testid={`edit-role-btn-${role.id}`}
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
                        title={`Remover Perfil ${role.nome}`}
                        data-testid={`delete-role-btn-${role.id}`}
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
                    <Shield size={20} color={role.badgeColor} aria-hidden="true" />
                  ) : isGestor ? (
                    <UserCheck size={20} color={role.badgeColor} aria-hidden="true" />
                  ) : isConsulta ? (
                    <Eye size={20} color={role.badgeColor} aria-hidden="true" />
                  ) : (
                    <Sparkles size={20} color={role.badgeColor} aria-hidden="true" />
                  )}
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    {role.nome}
                  </h3>
                </div>

                <p style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.45, margin: '0.6rem 0 0.85rem 0' }}>
                  {role.descricao}
                </p>

                {/* Resumo de Permissões Ativas */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.74rem',
                  color: '#475569',
                  background: '#f8fafc',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '6px',
                  border: '1px solid #f1f5f9',
                  marginBottom: '1rem'
                }}>
                  <Layers size={13} color="#64748b" />
                  <span>
                    Operações Autorizadas: <strong>{activeCount} de {totalConfigurablePerms}</strong>
                  </span>
                </div>
              </div>

              {/* Rodapé do Card: Escopo Contratual */}
              <div style={{
                paddingTop: '0.85rem',
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: '#334155'
                }}>
                  <span>Escopo Contratual:</span>
                  <span
                    data-testid={`role-scope-badge-${role.id}`}
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      padding: '0.2rem 0.55rem',
                      borderRadius: '6px',
                      background: scopeInfo.badgeBg,
                      color: scopeInfo.badgeColor,
                      border: `1px solid ${scopeInfo.badgeColor}30`
                    }}
                  >
                    {scopeInfo.label}
                  </span>
                </div>
                <div style={{ fontSize: '0.71rem', color: '#64748b', lineHeight: 1.35 }}>
                  {scopeInfo.description}
                </div>
              </div>
            </AppCard>
          );
        })}
      </div>

      {/* Tabela Comparativa de Permissões Agrupada por Macroprocessos */}
      <AppCard data-testid="matrix-table-card">
        <div style={{ marginBottom: '1.25rem' }}>
          <SectionHeader
            title="Matriz Canônica de Funcionalidades & Escopos"
            subtitle="Comparativo direto de ações autorizadas por perfil organizadas pelos 5 macroprocessos da gestão pública"
          />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table
            data-testid="roles-permissions-table"
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}
          >
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1', color: '#334155', fontSize: '0.78rem' }}>
                <th style={{ textAlign: 'left', padding: '0.85rem 1rem', fontWeight: 800, width: '42%' }}>
                  Macroprocesso & Operação
                </th>
                {roles.map((r) => {
                  const scopeInfo = getContractScopeDisplay(r.permissoes.contractScope, r.id === 'consulta');
                  return (
                    <th
                      key={r.id}
                      style={{
                        textAlign: 'center',
                        padding: '0.85rem 0.75rem',
                        fontWeight: 800,
                        color: r.badgeColor,
                        minWidth: '150px'
                      }}
                    >
                      <div style={{ fontSize: '0.85rem' }}>{r.nome}</div>
                      <div style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        color: scopeInfo.badgeColor,
                        background: scopeInfo.badgeBg,
                        display: 'inline-block',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        marginTop: '0.2rem'
                      }}>
                        {scopeInfo.label}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {MACROPROCESS_LIST.map((macro) => {
                const permsInMacro = PERMISSION_CATALOG.filter((p) => p.macroprocesso === macro.id);

                return (
                  <React.Fragment key={macro.id}>
                    {/* Cabeçalho da Seção do Macroprocesso */}
                    <tr
                      data-testid={`macroprocess-header-${macro.id}`}
                      style={{
                        background: '#f1f5f9',
                        borderTop: '2px solid #cbd5e1',
                        borderBottom: '1px solid #cbd5e1'
                      }}
                    >
                      <td colSpan={1 + roles.length} style={{ padding: '0.65rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong style={{
                            fontSize: '0.82rem',
                            color: '#0c326f',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em'
                          }}>
                            {macro.title}
                          </strong>
                          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                            — {macro.description}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* Linhas de Permissão do Macroprocesso */}
                    {permsInMacro.map((perm, pIdx) => (
                      <tr
                        key={perm.key}
                        data-testid={`matrix-row-${perm.key}`}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: pIdx % 2 === 0 ? '#ffffff' : '#fafafa'
                        }}
                      >
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>{perm.label}</span>
                            {perm.readOnly && (
                              <span style={{
                                fontSize: '0.66rem',
                                fontWeight: 700,
                                background: '#f1f5f9',
                                color: '#475569',
                                padding: '0.1rem 0.35rem',
                                borderRadius: '4px',
                                textTransform: 'uppercase'
                              }}>
                                Leitura
                              </span>
                            )}
                            {perm.key === 'visualizarTodosContratos' && (
                              <span style={{
                                fontSize: '0.66rem',
                                fontWeight: 700,
                                background: '#fef3c7',
                                color: '#b45309',
                                padding: '0.1rem 0.35rem',
                                borderRadius: '4px',
                                textTransform: 'uppercase'
                              }}>
                                Legado / Escopo
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.15rem' }}>
                            {perm.description}
                          </div>
                        </td>

                        {roles.map((r) => {
                          const isAllowed = Boolean(r.permissoes[perm.key]);

                          // Detalhamento contextual de escopo em permissões críticas
                          let contextTag: string | null = null;
                          if (isAllowed) {
                            if (perm.key === 'visualizarContratos') {
                              contextTag = r.permissoes.contractScope === 'GLOBAL' ? 'Global' : r.permissoes.contractScope === 'ASSIGNED' ? 'Atribuídos' : 'Unidade';
                            } else if (perm.key === 'sincronizarEmpenhos') {
                              contextTag = r.permissoes.contractScope === 'ASSIGNED' ? 'No Contrato' : 'Global';
                            }
                          } else if (perm.key === 'visualizarTodosContratos' && r.permissoes.contractScope === 'ASSIGNED') {
                            contextTag = 'Escopo Delimitado';
                          }

                          return (
                            <td
                              key={r.id}
                              style={{ textAlign: 'center', padding: '0.75rem 0.75rem', verticalAlign: 'middle' }}
                              data-testid={`perm-cell-${r.id}-${perm.key}`}
                            >
                              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                                {isAllowed ? (
                                  <span
                                    title={`Autorizado para ${r.nome}`}
                                    aria-label={`Permitido para ${r.nome}`}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      width: '24px',
                                      height: '24px',
                                      borderRadius: '50%',
                                      background: '#dcfce7',
                                      color: '#15803d'
                                    }}
                                  >
                                    <Check size={14} strokeWidth={3} />
                                  </span>
                                ) : (
                                  <span
                                    title={`Não autorizado para ${r.nome}`}
                                    aria-label={`Não permitido para ${r.nome}`}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      width: '24px',
                                      height: '24px',
                                      borderRadius: '50%',
                                      background: '#f1f5f9',
                                      color: '#94a3b8'
                                    }}
                                  >
                                    <X size={14} strokeWidth={2} />
                                  </span>
                                )}

                                {contextTag && (
                                  <span style={{
                                    fontSize: '0.64rem',
                                    fontWeight: 700,
                                    color: isAllowed ? '#15803d' : '#64748b',
                                    background: isAllowed ? '#f0fdf4' : '#f8fafc',
                                    padding: '0.1rem 0.35rem',
                                    borderRadius: '4px',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {contextTag}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </AppCard>

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
          <div
            data-testid="role-modal"
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '750px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e2e8f0'
            }}
          >
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
                  Defina o escopo de atuação e as permissões operacionais nos 5 macroprocessos
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                data-testid="modal-close-btn"
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
              
              {/* 1. Nome do Perfil */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  Nome do Perfil *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Fiscal Técnico Setorial"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  data-testid="role-name-input"
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

              {/* 2. Descrição */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  Descrição e Finalidade
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Responsável pela conferência técnica de medições e fiscalização de contratos setoriais."
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  data-testid="role-description-input"
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

              {/* 3. Cor Temática */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.45rem' }}>
                  Cor Temática do Perfil
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {PRESET_COLORS.map((color) => (
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
                    onChange={(e) => setBadgeColor(e.target.value)}
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

              {/* 4. SELEÇÃO DO ESCOPO CONTRATUAL (PERMISSÃO ≠ ESCOPO) */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem'
              }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.86rem', fontWeight: 800, color: '#0c326f' }}>
                    Escopo Contratual (Universo de Contratos) *
                  </label>
                  <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.2rem 0 0.5rem 0' }}>
                    Define sobre quais contratos este perfil tem autorização de visualização e operação.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.65rem' }}>
                  {SCOPE_OPTIONS.map((opt) => {
                    const isSelected = contractScope === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => handleScopeChange(opt.id)}
                        data-testid={`scope-option-${opt.id}`}
                        style={{
                          background: isSelected ? '#eff6ff' : '#ffffff',
                          border: isSelected ? '2px solid #0284c7' : '1px solid #cbd5e1',
                          borderRadius: '8px',
                          padding: '0.75rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <strong style={{ fontSize: '0.82rem', color: isSelected ? '#0c326f' : '#334155' }}>
                            {opt.label}
                          </strong>
                          {isSelected && <Check size={16} color="#0284c7" strokeWidth={3} />}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#0284c7', fontWeight: 700, marginBottom: '0.25rem' }}>
                          {opt.tag}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.35 }}>
                          {opt.desc}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 5. MATRIZ DE PERMISSÕES AGRUPADA PELOS 5 MACROPROCESSOS */}
              <div>
                <label style={{ display: 'block', fontSize: '0.86rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.2rem' }}>
                  Permissões Operacionais por Macroprocesso:
                </label>
                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0 0 0.75rem 0' }}>
                  Marque as operações autorizadas para este perfil. O escopo selecionado acima dita a abrangência dos dados.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {MACROPROCESS_LIST.map((macro) => {
                    const permsInMacro = PERMISSION_CATALOG.filter((p) => p.macroprocesso === macro.id);

                    return (
                      <div
                        key={macro.id}
                        style={{
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          background: '#f8fafc',
                          overflow: 'hidden'
                        }}
                      >
                        {/* Header do Macroprocesso */}
                        <div style={{
                          padding: '0.5rem 0.85rem',
                          background: '#e2e8f0',
                          borderBottom: '1px solid #cbd5e1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}>
                          <strong style={{ fontSize: '0.78rem', color: '#0c326f', textTransform: 'uppercase' }}>
                            {macro.title}
                          </strong>
                        </div>

                        {/* Lista de Checkboxes do Macroprocesso */}
                        <div style={{ padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {permsInMacro.map((perm) => {
                            const isLegacyScope = perm.key === 'visualizarTodosContratos';
                            const isChecked = Boolean(permissoes[perm.key]);

                            if (isLegacyScope) {
                              return (
                                <div
                                  key={perm.key}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '0.65rem',
                                    padding: '0.5rem 0.65rem',
                                    background: '#f1f5f9',
                                    border: '1px dashed #cbd5e1',
                                    borderRadius: '6px'
                                  }}
                                >
                                  <div style={{ marginTop: '0.1rem', color: '#64748b' }}>
                                    <Lock size={16} />
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>
                                        {perm.label}
                                      </span>
                                      <span style={{ fontSize: '0.66rem', background: '#e2e8f0', color: '#475569', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                                        Automático via Escopo ({contractScope})
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: '0.1rem' }}>
                                      Governada pelo seletor de Escopo Contratual acima (Ativa quando Global, Inativa quando Atribuídos/Unidade).
                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={perm.key}
                                onClick={() => handleTogglePermission(perm.key)}
                                data-testid={`modal-perm-${perm.key}`}
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '0.65rem',
                                  padding: '0.5rem 0.65rem',
                                  background: '#ffffff',
                                  border: isChecked ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <div style={{ marginTop: '0.1rem', color: isChecked ? '#0284c7' : '#94a3b8' }}>
                                  {isChecked ? <CheckSquare size={17} /> : <Square size={17} />}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                                      {perm.label}
                                    </span>
                                    {perm.readOnly && (
                                      <span style={{ fontSize: '0.66rem', background: '#f1f5f9', color: '#64748b', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                                        Leitura
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: '0.1rem' }}>
                                    {perm.description}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
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
                gap: '0.75rem',
                borderTop: '1px solid #f1f5f9',
                paddingTop: '0.75rem'
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
                  data-testid="submit-role-btn"
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
