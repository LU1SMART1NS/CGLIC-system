import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NoticeBar } from '../components/NoticeBar';

describe('NoticeBar', () => {
  it('mostra o texto e a ação ao lado', () => {
    const html = renderToStaticMarkup(<NoticeBar action={<button>Vincular</button>}>13 empenhos sem unidade</NoticeBar>);
    expect(html).toContain('13 empenhos sem unidade');
    expect(html).toContain('Vincular');
    expect(html).toContain('role="status"');
  });

  it('o aviso padrão é amarelo e o informativo é azul', () => {
    expect(renderToStaticMarkup(<NoticeBar>x</NoticeBar>)).toContain('background:var(--color-warning-bg)');
    expect(renderToStaticMarkup(<NoticeBar tone="info">x</NoticeBar>)).toContain('background:var(--color-info-bg)');
  });

  it('aceita testId próprio', () => {
    expect(renderToStaticMarkup(<NoticeBar testId="meu-aviso">x</NoticeBar>)).toContain('data-testid="meu-aviso"');
  });
});
