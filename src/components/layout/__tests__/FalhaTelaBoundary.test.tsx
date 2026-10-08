import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FalhaTelaBoundary } from '../FalhaTelaBoundary';

describe('FalhaTelaBoundary', () => {
  it('mostra a tela normalmente quando não há erro', () => {
    const html = renderToStaticMarkup(<FalhaTelaBoundary><p>conteúdo</p></FalhaTelaBoundary>);
    expect(html).toContain('conteúdo');
  });

  it('troca a página em branco por aviso com botão de recarregar', () => {
    const limite = new FalhaTelaBoundary({ children: <p>conteúdo</p> });
    limite.state = FalhaTelaBoundary.getDerivedStateFromError(new Error('falhou'));
    const html = renderToStaticMarkup(<>{limite.render()}</>);
    expect(html).toContain('Não foi possível abrir esta tela');
    expect(html).toContain('Recarregar a página');
    expect(html).not.toContain('conteúdo');
  });
});
