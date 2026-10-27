import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuantidadeComMaximo } from '../QuantidadeComMaximo';

const html = (valor: string, maximo: number | null) =>
  renderToStaticMarkup(
    <QuantidadeComMaximo rotulo="Quantidade" valor={valor} onMudar={() => {}} maximo={maximo} verbo="remanejar" motivo="O órgão que cede só tem 80 livres." testId="q" />
  );

describe('QuantidadeComMaximo (decisão D6)', () => {
  it('passou do máximo: uma frase com o máximo, o motivo e o botão Usar o máximo', () => {
    const h = html('150', 80);
    expect(h).toContain('máximo 80');
    expect(h).toContain('Você pode remanejar no máximo 80.');
    expect(h).toContain('O órgão que cede só tem 80 livres.');
    expect(h).toContain('Usar o máximo (80)');
  });

  it('dentro do máximo: sem mensagem; no máximo, sem o botão', () => {
    expect(html('40', 80)).not.toContain('Você pode');
    expect(html('80', 80)).not.toContain('Usar o máximo');
  });

  it('máximo zero: diz que não dá agora', () => {
    expect(html('5', 0)).toContain('Não dá para remanejar agora.');
  });

  it('sem máximo conhecido: só o campo', () => {
    const h = html('40', null);
    expect(h).not.toContain('máximo');
  });

  it('sem o botão quando a janela pede', () => {
    const h = renderToStaticMarkup(<QuantidadeComMaximo rotulo="Quantidade" valor="" onMudar={() => {}} maximo={13} verbo="remanejar" testId="q" comBotaoMaximo={false} />);
    expect(h).toContain('máximo 13');
    expect(h).not.toContain('Usar o máximo');
  });
});
