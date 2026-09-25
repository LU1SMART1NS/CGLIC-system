import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ManagementDashboardFilters } from '../ManagementDashboardFilters';
import type {
  ManagementDashboardFilters as FiltersType,
  ManagementDashboardAvailableFilters
} from '../../../types/managementDashboard';

describe('ManagementDashboardFilters Component (SaldoARP 3.0 — Fase 8-I)', () => {
  const mockAvailableFilters: ManagementDashboardAvailableFilters = {
    contracts: [
      { key: '102025', label: 'Contrato 10/2025', sublabel: 'Fornecedor A' },
      { key: '202025', label: 'Contrato 20/2025', sublabel: 'Fornecedor B' }
    ],
    atas: [
      { key: '01/2025', label: 'Ata 01/2025', sublabel: 'Servidores' },
      { key: '02/2025', label: 'Ata 02/2025', sublabel: 'Licenças' }
    ]
  };

  it('1. deve renderizar a barra de filtros no estado global sem filtros ativos', () => {
    const initialFilters: FiltersType = {
      uasg: '200331',
      statusContrato: 'TODOS'
    };

    const html = renderToStaticMarkup(
      <ManagementDashboardFilters
        filters={initialFilters}
        availableFilters={mockAvailableFilters}
        onFilterChange={() => {}}
        onResetFilters={() => {}}
      />
    );

    expect(html).toContain('Filtros do Dashboard');
    expect(html).toContain('UASG:');
    expect(html).toContain('Contrato 10/2025');
    expect(html).toContain('Ata 01/2025');
    expect(html).not.toContain('Contexto Ativo:');
    expect(html).not.toContain('Limpar Filtros');
  });

  it('2. deve renderizar banner de contexto ativo e chips quando houver filtros aplicados', () => {
    const activeFilters: FiltersType = {
      uasg: '200331',
      contractKey: '102025',
      numeroAta: '01/2025',
      statusContrato: 'ATIVO'
    };

    const html = renderToStaticMarkup(
      <ManagementDashboardFilters
        filters={activeFilters}
        availableFilters={mockAvailableFilters}
        onFilterChange={() => {}}
        onResetFilters={() => {}}
      />
    );

    expect(html).toContain('Contexto Ativo:');
    expect(html).toContain('Contrato 10/2025');
    expect(html).toContain('Ata 01/2025');
    expect(html).toContain('Situação: ATIVO');
    expect(html).toContain('Limpar Filtros');
  });

  it('3. deve exibir chip de UASG customizada quando diferente da padrão', () => {
    const customUasgFilters: FiltersType = {
      uasg: '160001',
      statusContrato: 'TODOS'
    };

    const html = renderToStaticMarkup(
      <ManagementDashboardFilters
        filters={customUasgFilters}
        availableFilters={mockAvailableFilters}
        onFilterChange={() => {}}
        onResetFilters={() => {}}
      />
    );

    expect(html).toContain('Contexto Ativo:');
    expect(html).toContain('UASG: 160001');
    expect(html).toContain('Limpar Filtros');
  });

  it('4. deve aplicar atributo disabled nos controles quando isLoading for true', () => {
    const html = renderToStaticMarkup(
      <ManagementDashboardFilters
        filters={{ uasg: '200331' }}
        availableFilters={mockAvailableFilters}
        onFilterChange={() => {}}
        onResetFilters={() => {}}
        isLoading={true}
      />
    );

    expect(html).toContain('disabled=""');
  });
});
