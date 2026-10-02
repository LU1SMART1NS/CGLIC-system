import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SummaryBar } from '../components/SummaryBar';

describe('SummaryBar', () => {
  it('mostra os números em uma linha, com a unidade padrão "un"', () => {
    const html = renderToStaticMarkup(<SummaryBar items={[{ label: 'Contratado', value: '690' }, { label: 'Valor', value: 'R$ 10', unit: '' }]} />);
    expect(html).toContain('Contratado <strong');
    expect(html).toContain('690');
    expect(html).toContain(' un');
    expect(html.match(/ un</g)?.length).toBe(1);
  });

  it('aplica a cor do tom ao valor', () => {
    const html = renderToStaticMarkup(<SummaryBar items={[{ label: 'A empenhar', value: '-3', tone: 'danger' }]} />);
    expect(html).toContain('color:var(--danger)');
  });

  it('mostra a barra de consumo quando há progresso', () => {
    const html = renderToStaticMarkup(<SummaryBar items={[]} progress={{ value: 50, max: 801 }} testId="t" />);
    expect(html).toContain('data-testid="t-progress"');
    expect(html).toContain('role="progressbar"');
  });

  it('em carregamento troca os números pelo texto e esconde barra e avisos', () => {
    const html = renderToStaticMarkup(
      <SummaryBar items={[{ label: 'X', value: '1' }]} progress={{ value: 1, max: 2 }} loading loadingLabel="Aguarde">
        <div>aviso</div>
      </SummaryBar>
    );
    expect(html).toContain('Aguarde');
    expect(html).not.toContain('progressbar');
    expect(html).not.toContain('aviso');
  });

  it('renderiza os avisos e os extras', () => {
    const html = renderToStaticMarkup(
      <SummaryBar items={[]} extra={<span>selo</span>}>
        <div>faixa</div>
      </SummaryBar>
    );
    expect(html).toContain('selo');
    expect(html).toContain('faixa');
  });
});
