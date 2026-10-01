import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstrumentPageState } from '../InstrumentPageState';

describe('InstrumentPageState', () => {
  it('carregando mostra título sem botões', () => {
    const html = renderToStaticMarkup(<InstrumentPageState kind="loading" title="Carregando..." />);
    expect(html).toContain('Carregando...');
    expect(html).not.toContain('<button');
  });

  it('erro mostra mensagem, tentar novamente e voltar', () => {
    const html = renderToStaticMarkup(
      <InstrumentPageState kind="error" title="Falha" message="Boom" onRetry={() => {}} backLabel="Voltar" onBack={() => {}} />
    );
    expect(html).toContain('Boom');
    expect(html).toContain('Tentar novamente');
    expect(html).toContain('Voltar');
  });

  it('não encontrado só mostra voltar', () => {
    const html = renderToStaticMarkup(
      <InstrumentPageState kind="notFound" title="Ata não encontrada" backLabel="Voltar para Atas" onBack={() => {}} />
    );
    expect(html).not.toContain('Tentar novamente');
    expect(html).toContain('Voltar para Atas');
  });
});
