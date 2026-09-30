import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RolesPermissions, ProfileDetailContent, PROFILE_DEFINITIONS } from '../RolesPermissions';

function findProfile(id: 'admin' | 'gestor' | 'gestor_saldos' | 'leitor') {
  const profile = PROFILE_DEFINITIONS.find((p) => p.id === id);
  if (!profile) throw new Error(`Perfil ${id} não encontrado em PROFILE_DEFINITIONS`);
  return profile;
}

describe('RolesPermissions — Tela de Perfis (Fase Perfis, orientada a negócio)', () => {
  describe('1-3. Página e cards dos quatro perfis', () => {
    const html = renderToStaticMarkup(<RolesPermissions />);

    it('1. renderiza o título "Perfis" e a descrição institucional', () => {
      expect(html).toContain('Perfis');
      expect(html).toContain('Perfis de acesso ao CGLIC e o que cada um pode consultar e gerir');
    });

    it('2. renderiza exatamente os quatro perfis nativos', () => {
      expect(html).toContain('Coordenador');
      expect(html).toContain('Gestor de Atas e Contratos');
      expect(html).toContain('Gestor de Saldo');
      expect(html).toContain('Consulta / Auditoria');
    });

    it('3. exibe as descrições de negócio corretas de cada perfil', () => {
      expect(html).toContain('Administração geral do sistema e gestão de todos os domínios.');
      expect(html).toContain('Gestão das Atas atribuídas — e dos contratos vinculados a elas — além dos contratos avulsos atribuídos individualmente.');
      expect(html).toContain('Gestão das alocações internas das Atas e das unidades internas.');
      expect(html).toContain('Consulta das informações do sistema, sem funções de administração.');
    });

    it('4. cada card tem um botão "Ver detalhes" associado à role correta do perfil', () => {
      expect(html).toContain('data-testid="ver-detalhes-admin"');
      expect(html).toContain('data-testid="ver-detalhes-gestor"');
      expect(html).toContain('data-testid="ver-detalhes-gestor_saldos"');
      expect(html).toContain('data-testid="ver-detalhes-leitor"');
      expect(html).toContain('Ver detalhes');
    });
  });

  describe('5-8. Detalhe por perfil ("Acesso por área") — testado via ProfileDetailContent, sem simulação de clique (suíte não usa jsdom)', () => {
    it('5. detalhe do Coordenador mostra gestão completa em todas as áreas de negócio', () => {
      const html = renderToStaticMarkup(<ProfileDetailContent profile={findProfile('admin')} />);

      expect(html).toContain('Contratos');
      expect(html).toContain('Gestão completa');
      expect(html).toContain('Execução financeira');
      expect(html).toContain('Alocações');
      expect(html).toContain('Unidades internas');
      expect(html).toContain('Usuários e servidores');
      expect(html).toContain('Perfis');
      expect(html).toContain('Todas as unidades');
    });

    it('6. detalhe do Gestor de Atas e Contratos mostra Atas, Contratos e Execução financeira', () => {
      const html = renderToStaticMarkup(<ProfileDetailContent profile={findProfile('gestor')} />);

      expect(html).toContain('Atas');
      expect(html).toContain('Gestão dentro do escopo atribuído');
      expect(html).toContain('Execução financeira');
      expect(html).toContain('Atas atribuídas (com os contratos vinculados) e contratos avulsos atribuídos individualmente');

      expect(html).not.toContain('Alocações');
      expect(html).not.toContain('Unidades internas');
      expect(html).not.toContain('Usuários e servidores');
    });

    it('7. detalhe do Gestor de Saldo mostra somente Alocações e Unidades internas', () => {
      const html = renderToStaticMarkup(<ProfileDetailContent profile={findProfile('gestor_saldos')} />);

      expect(html).toContain('Alocações');
      expect(html).toContain('Unidades internas');
      expect(html).toContain('Todas as Atas');

      expect(html).not.toContain('Contratos');
      expect(html).not.toContain('Usuários e servidores');
      expect(html).not.toContain('Execução financeira');
    });

    it('8. detalhe de Consulta/Auditoria mostra suas quatro áreas de consulta', () => {
      const html = renderToStaticMarkup(<ProfileDetailContent profile={findProfile('leitor')} />);

      expect(html).toContain('Consulta');
      expect(html).toContain('Informações disponíveis para consulta');
      expect(html).not.toContain('Usuários e servidores');
      expect(html).not.toContain('Perfis');
    });

    it('nunca lista áreas às quais o perfil não tem acesso como "Sem acesso" — a ausência já é a informação', () => {
      const html = renderToStaticMarkup(<ProfileDetailContent profile={findProfile('gestor_saldos')} />);
      expect(html).not.toContain('Sem acesso');
    });
  });

  describe('9-13. Complexidade legada removida', () => {
    const html = renderToStaticMarkup(<RolesPermissions />);

    it('9. não existem checkboxes (antiga matriz de 18 flags)', () => {
      expect(html).not.toContain('type="checkbox"');
    });

    it('10. não existe tabela comparativa de permissões', () => {
      expect(html).not.toContain('<table');
      expect(html).not.toContain('Matriz Canônica');
      expect(html).not.toContain('Macroprocesso');
    });

    it('11. não existe opção de criar novo perfil', () => {
      expect(html).not.toContain('Novo Perfil');
      expect(html).not.toContain('Criar Perfil');
    });

    it('12. não existe opção de excluir perfil nativo', () => {
      expect(html).not.toContain('Remover Perfil');
      expect(html).not.toContain('excluir');
    });

    it('13. não expõe contractScope, GLOBAL/ASSIGNED/UNIT ou outra nomenclatura técnica do RBAC', () => {
      expect(html).not.toContain('contractScope');
      expect(html).not.toContain('GLOBAL');
      expect(html).not.toContain('ASSIGNED');
      expect(html.match(/\bUNIT\b/)).toBeNull();
      expect(html).not.toContain('role_permissions');
      expect(html).not.toContain('permission_key');
    });

    it('não referencia o modelo legado de localStorage/roleService', () => {
      expect(html).not.toContain('Perfil Customizado');
      expect(html).not.toContain('Perfil Nativo');
      expect(html).not.toContain('Governança Institucional e Soberania RBAC');
    });
  });
});
