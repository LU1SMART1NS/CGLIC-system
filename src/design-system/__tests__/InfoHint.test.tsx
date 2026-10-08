import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { InfoHint } from '../components/InfoHint';
import { PageHeader } from '../components/PageHeader';

describe('InfoHint', () => {
  it('é um botão com nome acessível e sem a explicação visível até abrir', () => {
    const html = renderToStaticMarkup(<InfoHint content="Regra longa" testId="meu-hint" />);
    expect(html).toContain('data-testid="meu-hint"');
    expect(html).toContain('aria-label="Mais informações"');
    expect(html).not.toContain('Regra longa');
  });

  it('PageHeader mostra o ícone só quando recebe hint', () => {
    expect(renderToStaticMarkup(<PageHeader title="T" hint="Detalhe" />)).toContain('data-testid="page-header-hint"');
    expect(renderToStaticMarkup(<PageHeader title="T" />)).not.toContain('page-header-hint');
  });
});
