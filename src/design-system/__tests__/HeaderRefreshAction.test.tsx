import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HeaderRefreshAction } from '../components/HeaderRefreshAction';

describe('HeaderRefreshAction — Design System', () => {
  it('deve renderizar o indicador "Atualizado às HH:MM" e o botão "Atualizar"', () => {
    const fixedDate = new Date('2026-09-25T10:15:00.000Z');
    const html = renderToStaticMarkup(
      <HeaderRefreshAction
        onRefresh={vi.fn()}
        lastUpdated={fixedDate}
        dataTestId="test-refresh-action"
      />
    );

    expect(html).toContain('Atualizado às');
    expect(html).toContain('Atualizar');
    expect(html).toContain('test-refresh-action');
    // Indicador verde quando ocioso
    expect(html).toContain('background-color:#22c55e');
  });

  it('deve exibir estado de carregamento quando isRefreshing for true', () => {
    const html = renderToStaticMarkup(
      <HeaderRefreshAction
        onRefresh={vi.fn()}
        isRefreshing={true}
        dataTestId="test-refresh-loading"
      />
    );

    expect(html).toContain('Atualizando...');
    expect(html).toContain('background-color:#eab308');
  });

  it('deve exibir percentual de sincronização se fornecido em syncProgress', () => {
    const html = renderToStaticMarkup(
      <HeaderRefreshAction
        onRefresh={vi.fn()}
        isRefreshing={true}
        syncProgress={{ step: 'Baixando itens', percent: 65 }}
      />
    );

    expect(html).toContain('Sincronizando 65%');
  });
});
