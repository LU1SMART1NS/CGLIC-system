import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppButton } from '../components/AppButton';

describe('AppButton Component', () => {
  it('renders correctly with default props', () => {
    const html = renderToStaticMarkup(<AppButton>Click Me</AppButton>);
    expect(html).toContain('Click Me');
    expect(html).toContain('<button');
  });

  it('renders loading state correctly', () => {
    const html = renderToStaticMarkup(<AppButton isLoading>Submit</AppButton>);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
  });

  it('renders ghostDanger variant: só texto em vermelho, sem fundo cheio', () => {
    const html = renderToStaticMarkup(<AppButton variant="ghostDanger">Desvincular</AppButton>);
    expect(html).toContain('Desvincular');
    expect(html).toContain('ds-btn--ghostDanger');
    expect(html).not.toContain('ds-btn--danger ');
    expect(html).not.toContain('style=');
  });

  it('iconOnly: botão quadrado sem texto, com nome acessível vindo do title ou do aria-label', () => {
    const icon = <svg data-testid="ico" />;
    const comTitle = renderToStaticMarkup(<AppButton iconOnly size="sm" icon={icon} title="Desvincular contrato">Texto oculto</AppButton>);
    expect(comTitle).toContain('aria-label="Desvincular contrato"');
    expect(comTitle).toContain('ds-btn--icon');
    expect(comTitle).toContain('ds-btn--sm');
    expect(comTitle).toContain('data-testid="ico"');
    expect(comTitle).not.toContain('Texto oculto');

    const comAria = renderToStaticMarkup(<AppButton iconOnly icon={icon} title="Dica" aria-label="Nome explícito" />);
    expect(comAria).toContain('aria-label="Nome explícito"');
  });

  it('sem iconOnly o texto aparece e não há aria-label forçado', () => {
    const html = renderToStaticMarkup(<AppButton>Salvar</AppButton>);
    expect(html).toContain('Salvar');
    expect(html).not.toContain('aria-label');
  });

  it('renders outline variant', () => {
    const html = renderToStaticMarkup(<AppButton variant="outline">Outline</AppButton>);
    expect(html).toContain('Outline');
  });

  it('usa md e primary por padrão e não injeta <style> nem estilo inline', () => {
    const html = renderToStaticMarkup(<AppButton>Salvar</AppButton>);
    expect(html).toContain('class="ds-btn ds-btn--primary ds-btn--md"');
    expect(html).not.toContain('<style');
    expect(html).not.toContain('style=');
  });

  it.each(['primary', 'secondary', 'outline', 'ghost', 'danger', 'ghostDanger', 'success', 'link'] as const)(
    'expõe a variante %s por classe',
    (variant) => {
      expect(renderToStaticMarkup(<AppButton variant={variant}>x</AppButton>)).toContain(`ds-btn--${variant}`);
    }
  );

  it.each(['xs', 'sm', 'md', 'lg'] as const)('expõe o tamanho %s por classe', (size) => {
    expect(renderToStaticMarkup(<AppButton size={size}>x</AppButton>)).toContain(`ds-btn--${size}`);
  });

  it('fullWidth adiciona a classe de bloco e o carregando mostra o spinner por classe', () => {
    expect(renderToStaticMarkup(<AppButton fullWidth>x</AppButton>)).toContain('ds-btn--block');
    expect(renderToStaticMarkup(<AppButton isLoading>x</AppButton>)).toContain('ds-btn__spinner');
  });

  it('não força type: o padrão do HTML continua valendo dentro de formulários', () => {
    expect(renderToStaticMarkup(<AppButton>x</AppButton>)).not.toContain('type=');
    expect(renderToStaticMarkup(<AppButton type="submit">x</AppButton>)).toContain('type="submit"');
  });
});
