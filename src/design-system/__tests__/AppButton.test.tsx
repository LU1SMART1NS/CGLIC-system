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
    expect(html).toContain('color:var(--color-danger-text)');
    expect(html).toContain('background-color:transparent');
    expect(html).not.toContain('background-color:var(--color-danger-solid)');
  });

  it('iconOnly: botão quadrado sem texto, com nome acessível vindo do title ou do aria-label', () => {
    const icon = <svg data-testid="ico" />;
    const comTitle = renderToStaticMarkup(<AppButton iconOnly size="sm" icon={icon} title="Desvincular contrato">Texto oculto</AppButton>);
    expect(comTitle).toContain('aria-label="Desvincular contrato"');
    expect(comTitle).toContain('width:32px');
    expect(comTitle).toContain('height:32px');
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
});
