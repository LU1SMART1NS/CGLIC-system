import { describe, it, expect } from 'vitest';
import { navigationConfig, getBreadcrumbs, filterNavigationByRole } from '../navigation';
import { isExactChildActive, isItemActive } from '../../components/layout/Sidebar';

function flatLabels(items: ReturnType<typeof filterNavigationByRole>): string[] {
  return items.flatMap((item) => [item.label, ...(item.children?.map((c) => c.label) || [])]);
}

describe('Navigation Config & Breadcrumbs — Fase 9-C2 Shell & Navegação', () => {
  describe('Estrutura dos 5 Pilares e Itens de Navegação', () => {
    it('deve conter exatamente os 5 blocos estruturais no topo (Visão Geral + 4 grupos)', () => {
      const topIds = navigationConfig.map((item) => item.id);
      expect(topIds).toEqual([
        'gestao-instrumentos',
        'atas',
        'contratos',
        'execucao-financeira',
        'administracao'
      ]);
    });

    it('deve configurar Visão Geral (/instrumentos) no topo, absorvendo Visão Geral e Central de Atenção', () => {
      const gestaoInstrumentos = navigationConfig.find((i) => i.id === 'gestao-instrumentos');

      expect(gestaoInstrumentos).toBeDefined();
      expect(gestaoInstrumentos?.label).toBe('Visão Geral');
      expect(gestaoInstrumentos?.route).toBe('/instrumentos');
      expect(gestaoInstrumentos?.status).toBe('active');
      expect(gestaoInstrumentos?.matchPrefixes).toContain('/instrumentos');
      expect(gestaoInstrumentos?.matchPrefixes).toContain('/prazos');
    });

    it('deve configurar Atas de Registro de Preços com Consulta e Vigência, Alocações por Unidade, Modelos de Gestão de Atas e Unidades Internas', () => {
      const atas = navigationConfig.find((i) => i.id === 'atas');
      expect(atas).toBeDefined();
      expect(atas?.label).toBe('Atas de Registro de Preços');

      const children = atas?.children || [];
      expect(children.map((c) => c.label)).toEqual([
        'Consulta e Vigência',
        'Alocações por Unidade',
        'Modelos de Gestão de Atas',
        'Unidades Internas'
      ]);
      expect(children.map((c) => c.route)).toEqual([
        '/atas',
        '/atas/saldos-unidade',
        '/atas/modelos',
        '/admin/departamentos'
      ]);
    });

    it('deve configurar Contratos com Acompanhamento e Prazos e Modelos de Gestão de Contratos', () => {
      const contratos = navigationConfig.find((i) => i.id === 'contratos');
      expect(contratos).toBeDefined();
      expect(contratos?.label).toBe('Contratos');

      const children = contratos?.children || [];
      expect(children.map((c) => c.label)).toEqual([
        'Acompanhamento e Prazos',
        'Modelos de Gestão de Contratos'
      ]);
      expect(children[0].route).toBe('/contratos');
      expect(children[1].route).toBe('/contratos/modelos');
    });

    it('deve configurar Execução Financeira com Pagamentos e Empenhos & Execução', () => {
      const execucao = navigationConfig.find((i) => i.id === 'execucao-financeira');
      expect(execucao).toBeDefined();
      expect(execucao?.label).toBe('Execução Financeira');

      const children = execucao?.children || [];
      expect(children.map((c) => c.label)).toEqual([
        'Pagamentos',
        'Empenhos e Execução'
      ]);
      expect(children.map((c) => c.route)).toEqual([
        '/pagamentos',
        '/empenhos'
      ]);
      expect(children.every((c) => c.status === 'active')).toBe(true);
    });

    it('deve configurar Administração com Usuários e Perfis (sem Departamentos, que agora fica em Alocações)', () => {
      const admin = navigationConfig.find((i) => i.id === 'administracao');
      expect(admin).toBeDefined();
      expect(admin?.label).toBe('Administração');

      const children = admin?.children || [];
      expect(children.map((c) => c.label)).toEqual([
        'Usuários e Servidores',
        'Perfis e Permissões'
      ]);
      expect(children[0].route).toBe('/admin/usuarios');
      expect(children[1].route).toBe('/admin/perfis');
    });

    it('não deve conter itens legados isolados no menu raiz (SEI, Exportar Excel, Prorrogações soltas)', () => {
      const allIds = navigationConfig.flatMap((i) => [i.id, ...(i.children?.map((c) => c.id) || [])]);
      expect(allIds).not.toContain('processos-sei');
      expect(allIds).not.toContain('execucao-exportar');
      expect(allIds).not.toContain('contratos-aditivos');
    });
  });

  describe('Geração de Breadcrumbs Hierárquicos', () => {
    it('deve gerar breadcrumb para a rota raiz / (redireciona para /instrumentos)', () => {
      const crumbs = getBreadcrumbs('/');
      expect(crumbs).toEqual([{ label: 'Visão Geral' }]);
    });

    it('deve gerar breadcrumb para /instrumentos (Visão Geral)', () => {
      const crumbs = getBreadcrumbs('/instrumentos');
      expect(crumbs).toEqual([{ label: 'Visão Geral' }]);
    });

    it('deve gerar breadcrumb para /prazos (rota legada, redireciona para /instrumentos)', () => {
      const crumbs = getBreadcrumbs('/prazos');
      expect(crumbs).toEqual([{ label: 'Visão Geral', route: '/instrumentos' }]);
    });

    it('deve gerar breadcrumb para /contratos', () => {
      const crumbs = getBreadcrumbs('/contratos');
      expect(crumbs).toEqual([
        { label: 'Visão Geral', route: '/instrumentos' },
        { label: 'Acompanhamento e Prazos', route: '/contratos' }
      ]);
    });

    it('deve gerar breadcrumb dinâmico para a rota dedicada /contratos/:contractKey', () => {
      const crumbs = getBreadcrumbs('/contratos/200331-00015-2026');
      expect(crumbs).toEqual([
        { label: 'Visão Geral', route: '/instrumentos' },
        { label: 'Acompanhamento e Prazos', route: '/contratos' },
        { label: 'Contrato 200331-00015-2026', route: '/contratos/200331-00015-2026' }
      ]);
    });

    it('deve gerar breadcrumb para /pagamentos', () => {
      const crumbs = getBreadcrumbs('/pagamentos');
      expect(crumbs).toEqual([
        { label: 'Visão Geral', route: '/instrumentos' },
        { label: 'Pagamentos', route: '/pagamentos' }
      ]);
    });

    it('deve gerar breadcrumb para /empenhos', () => {
      const crumbs = getBreadcrumbs('/empenhos');
      expect(crumbs).toEqual([
        { label: 'Visão Geral', route: '/instrumentos' },
        { label: 'Empenhos e Execução', route: '/empenhos' }
      ]);
    });

    it('deve gerar breadcrumb para /atas, subrotas e alocações', () => {
      expect(getBreadcrumbs('/atas')).toEqual([
        { label: 'Visão Geral', route: '/instrumentos' },
        { label: 'Consulta e Vigência', route: '/atas' }
      ]);
      expect(getBreadcrumbs('/atas/itens')).toEqual([
        { label: 'Visão Geral', route: '/instrumentos' },
        { label: 'Consulta e Vigência', route: '/atas' },
        { label: 'Itens da Ata', route: '/atas/itens' }
      ]);
      expect(getBreadcrumbs('/atas/saldos-unidade')).toEqual([
        { label: 'Visão Geral', route: '/instrumentos' },
        { label: 'Consulta e Vigência', route: '/atas' },
        { label: 'Alocações por Unidade', route: '/atas/saldos-unidade' }
      ]);
      expect(getBreadcrumbs('/atas/modelos')).toEqual([
        { label: 'Visão Geral', route: '/instrumentos' },
        { label: 'Consulta e Vigência', route: '/atas' },
        { label: 'Modelos de Gestão de Atas', route: '/atas/modelos' }
      ]);
    });

    it('deve gerar breadcrumb dinâmico para a rota dedicada /atas/detalhe/:ataKey', () => {
      const crumbs = getBreadcrumbs('/atas/detalhe/00011%2F2026-200331');
      expect(crumbs).toEqual([
        { label: 'Visão Geral', route: '/instrumentos' },
        { label: 'Consulta e Vigência', route: '/atas' },
        { label: 'Ata 00011/2026-200331', route: '/atas/detalhe/00011%2F2026-200331' }
      ]);
    });

    it('deve gerar breadcrumb para rotas de administração', () => {
      expect(getBreadcrumbs('/admin/usuarios')).toEqual([
        { label: 'Visão Geral', route: '/instrumentos' },
        { label: 'Usuários e Servidores', route: '/admin/usuarios' }
      ]);
      expect(getBreadcrumbs('/admin/perfis')).toEqual([
        { label: 'Visão Geral', route: '/instrumentos' },
        { label: 'Perfis e Permissões', route: '/admin/perfis' }
      ]);
    });
  });

  describe('Match Prefixes para Destaque Ativo de Navegação', () => {
    it('deve incluir matchPrefixes em contratos-acompanhamento para manter menu ativo no 360°', () => {
      const contratosGroup = navigationConfig.find((item) => item.id === 'contratos');
      const contratosAcompanhamento = contratosGroup?.children?.find(
        (child) => child.id === 'contratos-acompanhamento'
      );

      expect(contratosAcompanhamento).toBeDefined();
      expect(contratosAcompanhamento?.matchPrefixes).toContain('/contratos');
    });

    it('deve incluir matchPrefixes nas rotas de Execução Financeira', () => {
      const execucaoGroup = navigationConfig.find((item) => item.id === 'execucao-financeira');
      const pagamentos = execucaoGroup?.children?.find((c) => c.id === 'execucao-pagamentos');
      const empenhos = execucaoGroup?.children?.find((c) => c.id === 'execucao-empenhos');

      expect(pagamentos?.matchPrefixes).toContain('/pagamentos');
      expect(empenhos?.matchPrefixes).toContain('/empenhos');
    });

    it('não deve selecionar simultaneamente Consulta e Vigência e Alocações por Unidade em /atas/saldos-unidade', () => {
      const atasGroup = navigationConfig.find((item) => item.id === 'atas')!;
      const atasConsulta = atasGroup.children!.find((c) => c.id === 'atas-consulta')!;
      const atasAlocacoes = atasGroup.children!.find((c) => c.id === 'atas-alocacoes')!;

      const pathname = '/atas/saldos-unidade';
      expect(isExactChildActive(atasAlocacoes, pathname)).toBe(true);
      expect(isExactChildActive(atasConsulta, pathname)).toBe(false);
      expect(isItemActive(atasGroup, pathname)).toBe(true);
    });

    it('não deve selecionar simultaneamente Consulta e Vigência e Modelos de Gestão de Atas em /atas/modelos', () => {
      const atasGroup = navigationConfig.find((item) => item.id === 'atas')!;
      const atasConsulta = atasGroup.children!.find((c) => c.id === 'atas-consulta')!;
      const atasModelos = atasGroup.children!.find((c) => c.id === 'atas-modelos')!;

      const pathname = '/atas/modelos';
      expect(isExactChildActive(atasModelos, pathname)).toBe(true);
      expect(isExactChildActive(atasConsulta, pathname)).toBe(false);
      expect(isItemActive(atasGroup, pathname)).toBe(true);
    });

    it('não deve selecionar simultaneamente Acompanhamento e Modelos de Gestão em /contratos/modelos', () => {
      const contratosGroup = navigationConfig.find((item) => item.id === 'contratos')!;
      const contratosAcompanhamento = contratosGroup.children!.find((c) => c.id === 'contratos-acompanhamento')!;
      const contratosModelos = contratosGroup.children!.find((c) => c.id === 'contratos-modelos')!;

      const pathname = '/contratos/modelos';
      expect(isExactChildActive(contratosModelos, pathname)).toBe(true);
      expect(isExactChildActive(contratosAcompanhamento, pathname)).toBe(false);
      expect(isItemActive(contratosGroup, pathname)).toBe(true);
    });

    it('deve selecionar Acompanhamento e Prazos quando estiver na tela 360° do contrato (/contratos/:id)', () => {
      const contratosGroup = navigationConfig.find((item) => item.id === 'contratos')!;
      const contratosAcompanhamento = contratosGroup.children!.find((c) => c.id === 'contratos-acompanhamento')!;
      const contratosModelos = contratosGroup.children!.find((c) => c.id === 'contratos-modelos')!;

      const pathname = '/contratos/50_2024';
      expect(isExactChildActive(contratosAcompanhamento, pathname)).toBe(true);
      expect(isExactChildActive(contratosModelos, pathname)).toBe(false);
      expect(isItemActive(contratosGroup, pathname)).toBe(true);
    });
  });

  describe('filterNavigationByRole — Autorização de Navegação por Perfil (Fase Frontend RBAC)', () => {
    it('Coordenador (admin) vê o menu completo, incluindo Usuários, Perfis e Alocações', () => {
      const visible = filterNavigationByRole(navigationConfig, 'admin');
      const labels = flatLabels(visible);

      expect(labels).toContain('Visão Geral');
      expect(labels).toContain('Alocações por Unidade');
      expect(labels).toContain('Unidades Internas');
      expect(labels).toContain('Modelos de Gestão de Contratos');
      expect(labels).toContain('Modelos de Gestão de Atas');
      expect(labels).toContain('Usuários e Servidores');
      expect(labels).toContain('Perfis e Permissões');
    });

    it('Gestor de Contratos (gestor) NÃO vê Alocações, Unidades Internas, Usuários ou Perfis, mas continua vendo Contratos', () => {
      const visible = filterNavigationByRole(navigationConfig, 'gestor');
      const labels = flatLabels(visible);

      expect(labels).toContain('Visão Geral');
      expect(labels).toContain('Consulta e Vigência');
      expect(labels).toContain('Acompanhamento e Prazos');
      expect(labels).toContain('Modelos de Gestão de Contratos');
      expect(labels).toContain('Modelos de Gestão de Atas');
      expect(labels).toContain('Pagamentos');
      expect(labels).toContain('Empenhos e Execução');

      expect(labels).not.toContain('Alocações por Unidade');
      expect(labels).not.toContain('Unidades Internas');
      expect(labels).not.toContain('Usuários e Servidores');
      expect(labels).not.toContain('Perfis e Permissões');

      // O grupo "Administração" não deve sobrar vazio no menu do gestor
      expect(labels).not.toContain('Administração');
    });

    it('Gestor de Saldo (gestor_saldos) só vê Alocações e Unidades Internas — nada de Contratos, Financeiro, Usuários ou Perfis', () => {
      const visible = filterNavigationByRole(navigationConfig, 'gestor_saldos');
      const labels = flatLabels(visible);

      expect(labels).toContain('Alocações por Unidade');
      expect(labels).toContain('Unidades Internas');

      expect(labels).not.toContain('Visão Geral');
      expect(labels).not.toContain('Consulta e Vigência');
      expect(labels).not.toContain('Acompanhamento e Prazos');
      expect(labels).not.toContain('Modelos de Gestão');
      expect(labels).not.toContain('Pagamentos');
      expect(labels).not.toContain('Empenhos e Execução');
      expect(labels).not.toContain('Usuários e Servidores');
      expect(labels).not.toContain('Perfis e Permissões');

      // Grupos que ficariam vazios (Contratos, Execução Financeira) somem inteiramente
      expect(labels).not.toContain('Contratos');
      expect(labels).not.toContain('Execução Financeira');
      // "Atas" sobrevive porque Alocações/Unidades Internas são filhos dela
      expect(labels).toContain('Atas de Registro de Preços');
    });

    it('Consulta/Auditoria (leitor) consulta os módulos permitidos, sem Usuários, Perfis', () => {
      const visible = filterNavigationByRole(navigationConfig, 'leitor');
      const labels = flatLabels(visible);

      expect(labels).toContain('Visão Geral');
      expect(labels).toContain('Consulta e Vigência');
      expect(labels).toContain('Acompanhamento e Prazos');
      expect(labels).toContain('Pagamentos');
      expect(labels).toContain('Empenhos e Execução');
      expect(labels).toContain('Alocações por Unidade');
      expect(labels).toContain('Unidades Internas');

      expect(labels).not.toContain('Modelos de Gestão');
      expect(labels).not.toContain('Usuários e Servidores');
      expect(labels).not.toContain('Perfis e Permissões');
    });

    it('role null (não resolvida ou ausente) só mostra itens públicos, nunca um grupo vazio', () => {
      const visible = filterNavigationByRole(navigationConfig, null);

      // Todo item hoje declara allowedRoles, então nada restrito deveria aparecer
      const labels = flatLabels(visible);
      expect(labels).not.toContain('Usuários e Servidores');
      expect(labels).not.toContain('Perfis e Permissões');
      expect(labels).not.toContain('Alocações por Unidade');

      // Nenhum grupo com children deve sobrar vazio
      visible.forEach((item) => {
        if (item.children) {
          expect(item.children.length).toBeGreaterThan(0);
        }
      });
    });

    it('itens sem allowedRoles permanecem públicos para qualquer role autenticada', () => {
      const semRestricao = { id: 'x', label: 'Público', status: 'active' as const };
      expect(filterNavigationByRole([semRestricao], 'leitor')).toHaveLength(1);
      expect(filterNavigationByRole([semRestricao], null)).toHaveLength(1);
    });
  });
});
