import { describe, it, expect } from 'vitest';

/**
 * Trava de padronização: botão de ação é sempre `AppButton`/`IconButton`.
 * `<button>` cru só existe onde o elemento NÃO é um botão de ação (aba, chip, cartão clicável,
 * cabeçalho de ordenação, paginação, item de menu, fechar de modal/toast) e está listado abaixo.
 * Se este teste falhar, use `AppButton` (variante `link` para ação em texto, `IconButton` para ícone).
 * Só acrescente aqui um novo `<button>` cru se ele for de fato um desses padrões.
 */
const PERMITIDOS: Record<string, number> = {
  'src/components/UserMenu.tsx': 4, // gatilho do menu, itens de menu e fechar do modal
  'src/components/atas/distribuicao/DistribuicaoItens.tsx': 1, // chip de complexidade
  'src/components/atas/distribuicao/EscolherAtaModal.tsx': 1, // cartão clicável de cada ata da lista
  'src/components/auth/AuthLayout.tsx': 1, // olho da senha
  'src/components/carteira/CarteiraCellFilter.tsx': 1, // filtro de célula
  'src/components/carteira/CarteiraFilterButton.tsx': 3, // filtro de coluna
  'src/components/carteira/CarteiraPagination.tsx': 1, // paginação
  'src/components/carteira/CarteiraRowLink.tsx': 1, // link de ID na tabela
  'src/components/carteira/CarteiraSegmentTabs.tsx': 1, // abas
  'src/components/carteira/CarteiraSortHeader.tsx': 1, // cabeçalho de ordenação
  'src/components/contracts/planTaskEditing.tsx': 1, // cabeçalho recolhível
  'src/components/instrument360/HealthStripParts.tsx': 1, // tile clicável
  'src/components/instrument360/Instrument360Tabs.tsx': 2, // abas e identificação da barra fixa
  'src/components/instrumentos/GestaoInstrumentosCategoryTabs.tsx': 1, // abas
  'src/components/instrumentos/GestaoInstrumentosSummaryCards.tsx': 4, // cartões-filtro
  'src/components/modals/ExportExcelModal.tsx': 7, // presets e chips de grupo
  'src/components/plan/TaskPlanSection.tsx': 1, // seletor de status
  'src/design-system/components/AppButton.tsx': 2, // o próprio componente (e a menção no comentário)
  'src/design-system/components/FilterBar.tsx': 1, // chip de filtro
  'src/design-system/components/Modal.tsx': 1, // fechar
  'src/design-system/components/Tabs.tsx': 1, // abas
  'src/design-system/components/Toast.tsx': 1 // fechar
};

const modules = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('padronização de botões', () => {
  it('não há <button> cru fora da lista de exceções', () => {
    const encontrados: Record<string, number> = {};
    for (const [rel, source] of Object.entries(modules)) {
      if (rel.includes('/__tests__/') || rel.endsWith('.test.tsx')) continue;
      const file = rel.replace(/^\//, '');
      const n = (source.match(/<button\b/g) ?? []).length;
      if (n > 0) encontrados[file] = n;
    }
    const excedentes = Object.entries(encontrados)
      .filter(([f, n]) => n > (PERMITIDOS[f] ?? 0))
      .map(([f, n]) => `${f}: ${n} (permitido ${PERMITIDOS[f] ?? 0})`);
    expect(excedentes, `Use AppButton/IconButton em vez de <button> cru:\n${excedentes.join('\n')}`).toEqual([]);
  });
});
