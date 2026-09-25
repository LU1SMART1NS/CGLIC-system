import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RolesPermissions } from '../RolesPermissions';
import * as rolesHook from '../../../hooks/useRoles';
import {
  SYSTEM_ROLES,
  PERMISSION_CATALOG,
  MACROPROCESS_LIST,
  type RoleDefinition
} from '../../../types/user';

vi.mock('../../../hooks/useRoles', () => ({
  useRoles: vi.fn(),
  useSaveRole: vi.fn(),
  useDeleteRole: vi.fn()
}));

const mockCustomRole: RoleDefinition = {
  id: 'custom-fiscal-ti',
  nome: 'Fiscal Técnico de TI',
  badgeColor: '#10b981',
  descricao: 'Fiscal designado para conferência técnica de serviços em nuvem.',
  isCustom: true,
  permissoes: {
    contractScope: 'ASSIGNED',
    visualizarTodosContratos: false,
    visualizarContratos: true,
    visualizarAtas: true,
    visualizarItens: true,
    distribuirContratos: false,
    editarTarefasContratuais: true,
    aplicarTemplates: false,
    visualizarEmpenhos: true,
    sincronizarEmpenhos: true,
    visualizarPagamentos: true,
    registrarPagamentos: true,
    visualizarPrazos: true,
    gerenciarEventosContratuais: false,
    gerenciarDepartamentos: false,
    exportarRelatorios: true,
    gerenciarUsuarios: false,
    gerenciarPerfis: false
  }
};

describe('RolesPermissions Component — Interface Visual do Modelo Canônico de RBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rolesHook.useRoles).mockReturnValue({
      data: [...SYSTEM_ROLES, mockCustomRole],
      isLoading: false,
      error: null
    } as any);

    vi.mocked(rolesHook.useSaveRole).mockReturnValue({
      mutate: vi.fn(),
      isPending: false
    } as any);

    vi.mocked(rolesHook.useDeleteRole).mockReturnValue({
      mutate: vi.fn(),
      isPending: false
    } as any);
  });

  describe('1. Cards de Perfis e Separação de Escopo', () => {
    it('deve renderizar os cards para coordenador, gestor, consulta e customizado', () => {
      const html = renderToStaticMarkup(<RolesPermissions />);
      expect(html).toContain('Coordenador / Diretor');
      expect(html).toContain('Gestor / Fiscal de Contrato');
      expect(html).toContain('Consulta / Auditoria');
      expect(html).toContain('Fiscal Técnico de TI');
    });

    it('coordenador deve exibir Escopo Contratual: Global no card', () => {
      const html = renderToStaticMarkup(<RolesPermissions />);
      expect(html).toContain('role-card-coordenador');
      expect(html).toContain('role-scope-badge-coordenador');
      expect(html).toContain('Global');
    });

    it('gestor deve exibir obrigatoriamente Escopo Contratual: Apenas Contratos Atribuídos', () => {
      const html = renderToStaticMarkup(<RolesPermissions />);
      expect(html).toContain('role-card-gestor');
      expect(html).toContain('role-scope-badge-gestor');
      expect(html).toContain('Apenas Contratos Atribuídos');
    });

    it('gestor NÃO deve exibir "Todos os Contratos" no card', () => {
      const html = renderToStaticMarkup(<RolesPermissions />);
      // O badge do gestor não pode conter "Todos os Contratos"
      const gestorCardSubstring = html.slice(
        html.indexOf('role-card-gestor'),
        html.indexOf('role-card-consulta')
      );
      expect(gestorCardSubstring).not.toContain('Todos os Contratos');
    });

    it('consulta/auditoria deve exibir Escopo Contratual: Global · Somente Leitura', () => {
      const html = renderToStaticMarkup(<RolesPermissions />);
      expect(html).toContain('role-scope-badge-consulta');
      expect(html).toContain('Global · Somente Leitura');
    });

    it('deve exibir contador de operações autorizadas nos cards', () => {
      const html = renderToStaticMarkup(<RolesPermissions />);
      expect(html).toContain('Operações Autorizadas:');
      expect(html).toContain('de 16');
    });
  });

  describe('2. Matriz Canônica Agrupada por Macroprocessos', () => {
    it('deve renderizar os 5 macroprocessos com títulos e descrições na tabela', () => {
      const html = renderToStaticMarkup(<RolesPermissions />);

      for (const macro of MACROPROCESS_LIST) {
        expect(html).toContain(`macroprocess-header-${macro.id}`);
        expect(html).toContain(macro.title.replace(/&/g, '&amp;'));
        expect(html).toContain(macro.description.replace(/&/g, '&amp;'));
      }
    });

    it('deve renderizar linhas correspondentes a cada permissão do PERMISSION_CATALOG', () => {
      const html = renderToStaticMarkup(<RolesPermissions />);

      for (const perm of PERMISSION_CATALOG) {
        expect(html).toContain(`matrix-row-${perm.key}`);
        expect(html).toContain(perm.label);
      }
    });

    it('deve indicar escopo delimitado para gestor na permissão visualizarTodosContratos', () => {
      const html = renderToStaticMarkup(<RolesPermissions />);
      expect(html).toContain('perm-cell-gestor-visualizarTodosContratos');
      expect(html).toContain('Escopo Delimitado');
    });

    it('deve indicar contexto de escopo atribuído para gestor em sincronizarEmpenhos', () => {
      const html = renderToStaticMarkup(<RolesPermissions />);
      expect(html).toContain('perm-cell-gestor-sincronizarEmpenhos');
      expect(html).toContain('No Contrato');
    });

    it('deve renderizar indicadores visuais acessíveis de permitido (check) e não permitido (X)', () => {
      const html = renderToStaticMarkup(<RolesPermissions />);
      expect(html).toContain('aria-label="Permitido para Coordenador / Diretor"');
      expect(html).toContain('aria-label="Não permitido para Gestor / Fiscal de Contrato"');
    });
  });

  describe('3. Perfis Customizados', () => {
    it('perfil customizado deve ter botão de exclusão habilitado', () => {
      const html = renderToStaticMarkup(<RolesPermissions />);
      expect(html).toContain('delete-role-btn-custom-fiscal-ti');
      // Perfis nativos não devem ter botão de exclusão
      expect(html).not.toContain('delete-role-btn-coordenador');
      expect(html).not.toContain('delete-role-btn-gestor');
      expect(html).not.toContain('delete-role-btn-consulta');
    });

    it('perfil customizado deve renderizar badge Perfil Customizado', () => {
      const html = renderToStaticMarkup(<RolesPermissions />);
      expect(html).toContain('Perfil Customizado');
      expect(html).toContain('Perfil Nativo');
    });
  });
});
