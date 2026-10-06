import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HeaderRefreshAction } from '../components/HeaderRefreshAction';

describe('HeaderRefreshAction — Design System', () => {
  it('deve renderizar o indicador "Atualizado às HH:MM" e o botão "Atualizar"', () => {
    const fixedDate = new Date();
    fixedDate.setHours(10, 15, 0, 0);
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

  it('sem onRefresh (perfis que não atualizam), mostra só a data, sem o botão', () => {
    const html = renderToStaticMarkup(
      <HeaderRefreshAction lastUpdated={new Date(2026, 8, 25, 10, 15)} dataTestId="test-refresh-action" />
    );
    expect(html).toContain('Atualizado em 25/09 às 10:15');
    expect(html).not.toContain('<button');
    expect(html).toContain('test-refresh-action-indicador');
  });

  it('atualização de outro dia mostra a data junto com a hora', () => {
    const html = renderToStaticMarkup(
      <HeaderRefreshAction onRefresh={vi.fn()} lastUpdated={new Date(2026, 8, 25, 10, 15)} />
    );
    expect(html).toContain('Atualizado em 25/09 às 10:15');
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
