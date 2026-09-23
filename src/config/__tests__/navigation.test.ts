import { describe, it, expect } from 'vitest';
import { getBreadcrumbs, navigationConfig } from '../navigation';

describe('Navigation Config & Breadcrumbs — Visão 360° do Contrato', () => {
  it('deve gerar breadcrumb para a rota raiz /', () => {
    const crumbs = getBreadcrumbs('/');
    expect(crumbs).toEqual([{ label: 'Início' }]);
  });

  it('deve gerar breadcrumb padrão para /contratos', () => {
    const crumbs = getBreadcrumbs('/contratos');
    expect(crumbs).toEqual([
      { label: 'Início', route: '/' },
      { label: 'Acompanhamento e Prazos de Contratos', route: '/contratos' }
    ]);
  });

  it('deve gerar breadcrumb dinâmico para a rota dedicada /contratos/:contractKey', () => {
    const crumbs = getBreadcrumbs('/contratos/200331-00015-2026');
    expect(crumbs).toEqual([
      { label: 'Início', route: '/' },
      { label: 'Acompanhamento e Prazos de Contratos', route: '/contratos' },
      { label: 'Contrato 200331-00015-2026', route: '/contratos/200331-00015-2026' }
    ]);
  });

  it('deve incluir matchPrefixes em contratos-dashboard para manter menu ativo no 360°', () => {
    const contratosGroup = navigationConfig.find((item) => item.id === 'contratos');
    const contratosDashboard = contratosGroup?.children?.find((child) => child.id === 'contratos-dashboard');

    expect(contratosDashboard).toBeDefined();
    expect(contratosDashboard?.matchPrefixes).toContain('/contratos');
  });
});
