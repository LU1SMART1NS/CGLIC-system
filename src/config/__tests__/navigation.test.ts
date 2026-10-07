import { describe, it, expect } from 'vitest';
import { navigationConfig, getBreadcrumbs, filterNavigationByRole, findAreaForTabs } from '../navigation';
import { isExactChildActive, isItemActive } from '../../components/layout/Sidebar';

function flatLabels(items: ReturnType<typeof filterNavigationByRole>): string[] {
  return items.flatMap((item) => [item.label, ...(item.children?.map((c) => c.label) || [])]);
}

describe('Navigation Config & Breadcrumbs — Fase 9-C2 Shell & Navegação', () => {
  describe('Menu chave com 4 áreas e páginas como abas', () => {
    it('deve conter as 4 áreas do menu chave, com Configurações no pé', () => {
      expect(navigationConfig.map((item) => item.id)).toEqual([
        'visao-geral',
        'carteira',
        'execucao-financeira',
        'configuracoes'
      ]);
      expect(navigationConfig.map((item) => item.label)).toEqual(['Visão Geral', 'Carteira', 'Financeiro', 'Configurações']);
      expect(navigationConfig.find((i) => i.id === 'configuracoes')?.placement).toBe('bottom');
      expect(navigationConfig.every((i) => (i.children?.length ?? 0) > 0)).toBe(true);
    });

    it('Visão Geral tem as abas Painel (/instrumentos) e Distribuição (/atas/distribuicao)', () => {
      const area = navigationConfig.find((i) => i.id === 'visao-geral')!;
      expect(area.children!.map((c) => [c.label, c.route])).toEqual([
        ['Painel', '/instrumentos'],
        ['Distribuição', '/atas/distribuicao']
      ]);
      expect(area.children![0].matchPrefixes).toContain('/prazos');
    });

    it('Carteira tem as abas Atas, Contratos e Itens (unidade interna e órgão partícipe são filtros)', () => {
      const area = navigationConfig.find((i) => i.id === 'carteira')!;
      expect(area.children!.map((c) => [c.label, c.route])).toEqual([
        ['Atas', '/atas'],
        ['Contratos', '/contratos'],
        ['Itens', '/itens']
      ]);
    });

    it('Financeiro tem as abas Empenhos e Pagamentos', () => {
      const area = navigationConfig.find((i) => i.id === 'execucao-financeira')!;
      expect(area.children!.map((c) => [c.label, c.route])).toEqual([
        ['Empenhos', '/empenhos'],
        ['Pagamentos', '/pagamentos']
      ]);
      expect(area.children!.every((c) => c.status === 'active')).toBe(true);
    });

    it('Configurações tem os Modelos de Gestão e a administração do sistema', () => {
      const area = navigationConfig.find((i) => i.id === 'configuracoes')!;
      expect(area.children!.map((c) => [c.label, c.route])).toEqual([
        ['Modelos de Gestão', '/configuracoes/modelos'],
        ['Regras de Alertas', '/admin/regras-alertas'],
        ['Feriados', '/admin/feriados'],
        ['Unidades Internas', '/admin/departamentos'],
        ['Usuários e Servidores', '/admin/usuarios'],
        ['Perfis e Permissões', '/admin/perfis']
      ]);
      expect(area.children!.map((c) => c.group)).toEqual(['Gestão', 'Gestão', 'Gestão', 'Gestão', 'Acesso', 'Acesso']);
    });

    it('não deve conter itens legados isolados no menu (SEI, Exportar Excel, Prorrogações soltas)', () => {
      const allIds = navigationConfig.flatMap((i) => [i.id, ...(i.children?.map((c) => c.id) || [])]);
      expect(allIds).not.toContain('processos-sei');
      expect(allIds).not.toContain('execucao-exportar');
      expect(allIds).not.toContain('contratos-aditivos');
    });
  });

  describe('Abas da área (findAreaForTabs)', () => {
    it('mostra as abas da área só nas páginas de lista', () => {
      const admin = filterNavigationByRole(navigationConfig, 'admin');
      expect(findAreaForTabs(admin, '/atas')?.id).toBe('carteira');
      expect(findAreaForTabs(admin, '/contratos')?.id).toBe('carteira');
      expect(findAreaForTabs(admin, '/itens')?.id).toBe('carteira');
      expect(findAreaForTabs(admin, '/atas/distribuicao')?.id).toBe('visao-geral');
      expect(findAreaForTabs(admin, '/admin/feriados')?.id).toBe('configuracoes');
      expect(findAreaForTabs(admin, '/admin/departamentos')?.id).toBe('configuracoes');
    });

    it('telas de detalhe (Ata 360, Item, Contrato 360) e subpáginas não recebem as abas da área', () => {
      const admin = filterNavigationByRole(navigationConfig, 'admin');
      expect(findAreaForTabs(admin, '/atas/detalhe/00011%2F2026-200331')).toBeNull();
      expect(findAreaForTabs(admin, '/atas/detalhe/00011%2F2026-200331/itens/00003')).toBeNull();
      expect(findAreaForTabs(admin, '/contratos/200331-00015-2026')).toBeNull();
    });

    it('o gestor vê a Visão Geral com uma aba só (sem Distribuição)', () => {
      const gestor = filterNavigationByRole(navigationConfig, 'gestor');
      expect(findAreaForTabs(gestor, '/instrumentos')?.children?.map((c) => c.label)).toEqual(['Painel']);
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
        { label: 'Carteira de Contratos', route: '/contratos' }
      ]);
    });

    it('deve gerar breadcrumb dinâmico para a rota dedicada /contratos/:contractKey', () => {
      const crumbs = getBreadcrumbs('/contratos/200331-00015-2026');
      expect(crumbs).toEqual([
        { label: 'Visão Geral', route: '/instrumentos' },
        { label: 'Carteira de Contratos', route: '/contratos' },
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
        { label: 'Empenhos', route: '/empenhos' }
      ]);
    });

    it('deve gerar breadcrumb para /atas, subrotas e itens', () => {
      expect(getBreadcrumbs('/atas')).toEqual([
        { label: 'Visão Geral', route: '/instrumentos' },
        { label: 'Carteira de Atas', route: '/atas' }
      ]);
      expect(getBreadcrumbs('/itens')).toEqual([
        { label: 'Visão Geral', route: '/instrumentos' },
        { label: 'Carteira de Itens', route: '/itens' }
      ]);
      expect(getBreadcrumbs('/atas/distribuicao')).toEqual([
        { label: 'Visão Geral', route: '/instrumentos' },
        { label: 'Central de Distribuição', route: '/atas/distribuicao' }
      ]);
      expect(getBreadcrumbs('/configuracoes/modelos')).toEqual([
        { label: 'Visão Geral', route: '/instrumentos' },
        { label: 'Modelos de Gestão', route: '/configuracoes/modelos' }
      ]);
    });

    it('deve gerar breadcrumb dinâmico para a rota dedicada /atas/detalhe/:ataKey', () => {
      const crumbs = getBreadcrumbs('/atas/detalhe/00011%2F2026-200331');
      expect(crumbs).toEqual([
        { label: 'Visão Geral', route: '/instrumentos' },
        { label: 'Carteira de Atas', route: '/atas' },
        { label: 'Ata 00011/2026', route: '/atas/detalhe/00011%2F2026-200331' }
      ]);
    });

    it('deve gerar breadcrumb Carteira › Ata › Item para o endereço próprio do item', () => {
      expect(getBreadcrumbs('/atas/detalhe/00011%2F2026-200331/itens/00003')).toEqual([
        { label: 'Visão Geral', route: '/instrumentos' },
        { label: 'Carteira de Atas', route: '/atas' },
        { label: 'Ata 00011/2026', route: '/atas/detalhe/00011%2F2026-200331' },
        { label: 'Item 00003', route: '/atas/detalhe/00011%2F2026-200331/itens/00003' }
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
    const area = (id: string) => navigationConfig.find((item) => item.id === id)!;
    const child = (areaId: string, id: string) => area(areaId).children!.find((c) => c.id === id)!;

    it('mantém Contratos ativo na tela 360° do contrato (/contratos/:id)', () => {
      const pathname = '/contratos/50_2024';
      expect(isExactChildActive(child('carteira', 'contratos-acompanhamento'), pathname)).toBe(true);
      expect(isItemActive(area('carteira'), pathname)).toBe(true);
    });

    it('deve incluir matchPrefixes nas rotas do Financeiro', () => {
      expect(child('execucao-financeira', 'execucao-pagamentos').matchPrefixes).toContain('/pagamentos');
      expect(child('execucao-financeira', 'execucao-empenhos').matchPrefixes).toContain('/empenhos');
    });

    it('em /itens só Itens fica selecionada, sem Atas nem Contratos', () => {
      const pathname = '/itens';
      expect(isExactChildActive(child('carteira', 'itens-carteira'), pathname)).toBe(true);
      expect(isExactChildActive(child('carteira', 'atas-consulta'), pathname)).toBe(false);
      expect(isExactChildActive(child('carteira', 'contratos-acompanhamento'), pathname)).toBe(false);
      expect(isItemActive(area('carteira'), pathname)).toBe(true);
    });

    it('em /atas/distribuicao só a Visão Geral fica ativa, sem acender a Carteira', () => {
      const pathname = '/atas/distribuicao';
      expect(isItemActive(area('visao-geral'), pathname)).toBe(true);
      expect(isItemActive(area('carteira'), pathname)).toBe(false);
    });

    it('em /configuracoes/modelos só Configurações fica ativa', () => {
      const pathname = '/configuracoes/modelos';
      expect(isExactChildActive(child('configuracoes', 'config-modelos'), pathname)).toBe(true);
      expect(isItemActive(area('configuracoes'), pathname)).toBe(true);
      expect(isItemActive(area('carteira'), pathname)).toBe(false);
    });

    it('a Ata 360 mantém a Carteira ativa', () => {
      expect(isItemActive(area('carteira'), '/atas/detalhe/00011%2F2026-200331')).toBe(true);
    });

    it('o cadastro de unidades internas fica em Configurações, não na Carteira', () => {
      expect(isItemActive(area('configuracoes'), '/admin/departamentos')).toBe(true);
      expect(isItemActive(area('carteira'), '/admin/departamentos')).toBe(false);
    });
  });

  describe('filterNavigationByRole — Autorização de Navegação por Perfil (Fase Frontend RBAC)', () => {
    it('Coordenador (admin) vê o menu completo, incluindo Usuários, Perfis e Itens', () => {
      const visible = filterNavigationByRole(navigationConfig, 'admin');
      const labels = flatLabels(visible);

      expect(labels).toContain('Visão Geral');
      expect(labels).toContain('Itens');
      expect(labels).toContain('Modelos de Gestão');
      expect(labels).toContain('Distribuição');
      expect(labels).toContain('Usuários e Servidores');
      expect(labels).toContain('Perfis e Permissões');
    });

    it('Gestor de Contratos (gestor) vê Atas, Contratos e Itens, mas NÃO vê Usuários ou Perfis', () => {
      const visible = filterNavigationByRole(navigationConfig, 'gestor');
      const labels = flatLabels(visible);

      expect(labels).toContain('Visão Geral');
      expect(labels).toContain('Atas');
      expect(labels).toContain('Contratos');
      expect(labels).toContain('Itens');
      expect(labels).toContain('Modelos de Gestão');
      expect(labels).toContain('Pagamentos');
      expect(labels).toContain('Empenhos');

      // A distribuição por gestor é visão de coordenação: o gestor já vê só a própria carteira.
      expect(labels).not.toContain('Distribuição');
      expect(labels).not.toContain('Usuários e Servidores');
      expect(labels).not.toContain('Perfis e Permissões');

      // Configurações aparece para o gestor com os modelos de gestão e a consulta das unidades internas
      const config = visible.find((i) => i.id === 'configuracoes');
      expect(config?.children?.map((c) => c.label)).toEqual(['Modelos de Gestão', 'Unidades Internas']);
    });

    it('Gestor de Saldo (gestor_saldos) vê Visão Geral (restrita a saldos), Atas e Itens — nada de Contratos, Financeiro, Usuários ou Perfis', () => {
      const visible = filterNavigationByRole(navigationConfig, 'gestor_saldos');
      const labels = flatLabels(visible);

      expect(labels).toContain('Itens');
      expect(labels).not.toContain('Distribuição');

      expect(labels).toContain('Visão Geral');
      expect(labels).toContain('Atas');
      expect(labels).not.toContain('Contratos');
      expect(labels).not.toContain('Modelos de Gestão');
      // Configurações aparece só com o cadastro de unidades internas, que ele mantém
      expect(visible.find((i) => i.id === 'configuracoes')?.children?.map((c) => c.label)).toEqual(['Unidades Internas']);
      expect(labels).not.toContain('Pagamentos');
      expect(labels).not.toContain('Empenhos');
      expect(labels).not.toContain('Usuários e Servidores');
      expect(labels).not.toContain('Perfis e Permissões');

      // Área que ficaria vazia (Financeiro) some inteiramente
      expect(labels).not.toContain('Financeiro');
      expect(labels).toContain('Carteira');
    });

    it('Consulta/Auditoria (leitor) consulta os módulos permitidos, sem Usuários, Perfis', () => {
      const visible = filterNavigationByRole(navigationConfig, 'leitor');
      const labels = flatLabels(visible);

      expect(labels).toContain('Visão Geral');
      expect(labels).toContain('Atas');
      expect(labels).toContain('Contratos');
      expect(labels).toContain('Pagamentos');
      expect(labels).toContain('Empenhos');
      expect(labels).toContain('Itens');
      expect(labels).toContain('Distribuição');

      expect(labels).not.toContain('Modelos de Gestão');
      // Configurações aparece para o leitor só com a consulta das unidades internas
      expect(visible.find((i) => i.id === 'configuracoes')?.children?.map((c) => c.label)).toEqual(['Unidades Internas']);
      expect(labels).not.toContain('Usuários e Servidores');
      expect(labels).not.toContain('Perfis e Permissões');
    });

    it('role null (não resolvida ou ausente) só mostra itens públicos, nunca um grupo vazio', () => {
      const visible = filterNavigationByRole(navigationConfig, null);

      // Todo item hoje declara allowedRoles, então nada restrito deveria aparecer
      const labels = flatLabels(visible);
      expect(labels).not.toContain('Usuários e Servidores');
      expect(labels).not.toContain('Perfis e Permissões');
      expect(labels).not.toContain('Por unidade interna');

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
