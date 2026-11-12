import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SecaoDaMesa, type LinhaDeTrabalho } from '../MesaDeTrabalho';

const linha = (chave: string, extra: Partial<LinhaDeTrabalho> = {}): LinhaDeTrabalho => ({
  chave,
  tom: 'eu',
  titulo: `Passo ${chave}`,
  botoes: [{ rotulo: 'Registrar', jeito: 'botao', onClick: () => {}, testId: `b-${chave}` }],
  ...extra
});
const id = (l: LinhaDeTrabalho) => `t-${l.chave}`;

describe('SecaoDaMesa', () => {
  it('mostra o tom, o prazo vencido e o botão de cada linha', () => {
    const html = renderToStaticMarkup(<SecaoDaMesa titulo="Com você" linhas={[linha('a', { tom: 'vencido', prazo: '01/11/2026', vencido: true })]} testId="s" linhaTestId={id} destaque vazio="Nada." />);
    expect(html).toMatch(/data-testid="t-a" data-tom="vencido"/);
    expect(html).toContain('venceu em 01/11/2026');
    expect(html).toContain('b-a');
    expect(html).toContain('Com você · 1');
  });

  it('sem linhas: Com você diz que não há nada; Com outros some', () => {
    expect(renderToStaticMarkup(<SecaoDaMesa titulo="Com você" linhas={[]} testId="s" linhaTestId={id} destaque vazio="Nada com você agora." />)).toContain('Nada com você agora.');
    expect(renderToStaticMarkup(<SecaoDaMesa titulo="Com outros" linhas={[]} testId="s" linhaTestId={id} />)).toBe('');
  });

  it('corta no limite com "e mais N" e esconde os botões quando não pode agir', () => {
    const html = renderToStaticMarkup(<SecaoDaMesa titulo="Com o fiscal" linhas={[linha('a'), linha('b'), linha('c')]} testId="s" linhaTestId={id} limite={2} semBotoes />);
    expect(html).toContain('t-b');
    expect(html).not.toContain('t-c');
    expect(html).toContain('e mais 1');
    expect(html).not.toContain('b-a');
  });
});
