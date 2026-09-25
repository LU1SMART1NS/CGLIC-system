import { describe, it, expect } from 'vitest';
import { navigationConfig, getBreadcrumbs } from '../navigation';
import { isExactChildActive, isItemActive } from '../../components/layout/Sidebar';

describe('Navigation Config & Breadcrumbs — Fase 9-C2 Shell & Navegação', () => {
  describe('Estrutura dos 5 Pilares e Itens de Navegação', () => {
    it('deve conter exatamente os 6 blocos estruturais no topo (Visão Geral, Atenção + 4 grupos)', () => {
      const topIds = navigationConfig.map((item) => item.id);
      expect(topIds).toEqual([
        'visao-geral',
        'central-atencao',
        'atas',
        'contratos',
        'execucao-financeira',
        'administracao'
      ]);
    });

    it('deve configurar Visão Geral (/) e Central de Atenção (/prazos) no topo', () => {
      const visaoGeral = navigationConfig.find((i) => i.id === 'visao-geral');
      const centralAtencao = navigationConfig.find((i) => i.id === 'central-atencao');

      expect(visaoGeral).toBeDefined();
      expect(visaoGeral?.label).toBe('Visão Geral');
      expect(visaoGeral?.route).toBe('/');
      expect(visaoGeral?.status).toBe('active');

      expect(centralAtencao).toBeDefined();
      expect(centralAtencao?.label).toBe('Central de Atenção');
      expect(centralAtencao?.route).toBe('/prazos');
      expect(centralAtencao?.status).toBe('active');
    });

    it('deve configurar Atas de Registro de Preços com Consulta e Vigência e Alocações por Unidade', () => {
      const atas = navigationConfig.find((i) => i.id === 'atas');
      expect(atas).toBeDefined();
      expect(atas?.label).toBe('Atas de Registro de Preços');

      const children = atas?.children || [];
      expect(children.map((c) => c.label)).toEqual([
        'Consulta e Vigência',
        'Alocações por Unidade'
      ]);
      expect(children.map((c) => c.route)).toEqual([
        '/atas',
        '/atas/saldos-unidade'
      ]);
    });

    it('deve configurar Contratos com Acompanhamento e Prazos e Modelos de Gestão', () => {
      const contratos = navigationConfig.find((i) => i.id === 'contratos');
      expect(contratos).toBeDefined();
      expect(contratos?.label).toBe('Contratos');

      const children = contratos?.children || [];
      expect(children.map((c) => c.label)).toEqual([
        'Acompanhamento e Prazos',
        'Modelos de Gestão'
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
    it('deve gerar breadcrumb para a rota raiz /', () => {
      const crumbs = getBreadcrumbs('/');
      expect(crumbs).toEqual([{ label: 'Visão Geral' }]);
    });

    it('deve gerar breadcrumb para /prazos (Central de Atenção)', () => {
      const crumbs = getBreadcrumbs('/prazos');
      expect(crumbs).toEqual([
        { label: 'Visão Geral', route: '/' },
        { label: 'Central de Atenção', route: '/prazos' }
      ]);
    });

    it('deve gerar breadcrumb para /contratos', () => {
      const crumbs = getBreadcrumbs('/contratos');
      expect(crumbs).toEqual([
        { label: 'Visão Geral', route: '/' },
        { label: 'Acompanhamento e Prazos', route: '/contratos' }
      ]);
    });

    it('deve gerar breadcrumb dinâmico para a rota dedicada /contratos/:contractKey', () => {
      const crumbs = getBreadcrumbs('/contratos/200331-00015-2026');
      expect(crumbs).toEqual([
        { label: 'Visão Geral', route: '/' },
        { label: 'Acompanhamento e Prazos', route: '/contratos' },
        { label: 'Contrato 200331-00015-2026', route: '/contratos/200331-00015-2026' }
      ]);
    });

    it('deve gerar breadcrumb para /pagamentos', () => {
      const crumbs = getBreadcrumbs('/pagamentos');
      expect(crumbs).toEqual([
        { label: 'Visão Geral', route: '/' },
        { label: 'Pagamentos', route: '/pagamentos' }
      ]);
    });

    it('deve gerar breadcrumb para /empenhos', () => {
      const crumbs = getBreadcrumbs('/empenhos');
      expect(crumbs).toEqual([
        { label: 'Visão Geral', route: '/' },
        { label: 'Empenhos e Execução', route: '/empenhos' }
      ]);
    });

    it('deve gerar breadcrumb para /atas, subrotas e alocações', () => {
      expect(getBreadcrumbs('/atas')).toEqual([
        { label: 'Visão Geral', route: '/' },
        { label: 'Consulta e Vigência', route: '/atas' }
      ]);
      expect(getBreadcrumbs('/atas/itens')).toEqual([
        { label: 'Visão Geral', route: '/' },
        { label: 'Consulta e Vigência', route: '/atas' },
        { label: 'Itens da Ata', route: '/atas/itens' }
      ]);
      expect(getBreadcrumbs('/atas/saldos-unidade')).toEqual([
        { label: 'Visão Geral', route: '/' },
        { label: 'Consulta e Vigência', route: '/atas' },
        { label: 'Alocações por Unidade', route: '/atas/saldos-unidade' }
      ]);
    });

    it('deve gerar breadcrumb para rotas de administração', () => {
      expect(getBreadcrumbs('/admin/usuarios')).toEqual([
        { label: 'Visão Geral', route: '/' },
        { label: 'Usuários e Servidores', route: '/admin/usuarios' }
      ]);
      expect(getBreadcrumbs('/admin/perfis')).toEqual([
        { label: 'Visão Geral', route: '/' },
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
});
