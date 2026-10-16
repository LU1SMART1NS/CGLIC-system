import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Instrument360Hero } from '../Instrument360Hero';
import { HealthTile, HealthTileModeContext } from '../HealthStripParts';
import { DockContext, type DockContextValue } from '../instrument360Dock';

const dock = (phone: boolean): DockContextValue => ({
  min: false,
  setMin: () => undefined,
  phone,
  phoneDocked: false,
  phoneBarSlot: null,
  setPhone: () => undefined
});

const render = (phone: boolean) =>
  renderToStaticMarkup(
    <DockContext.Provider value={dock(phone)}>
      <Instrument360Hero
        backLabel="Voltar para Carteira"
        onBack={() => undefined}
        title="Ata nº 00044/2026"
        eyebrow="UASG 200331 · SENASP"
        objeto="Registro de preços para aquisição de drones"
        dates={[
          { label: 'Assinatura', value: '01/09/2026' },
          { label: 'Divulgação no PNCP', value: '04/09/2026' },
          { label: 'Vigência', value: '08/09/2026 a 08/09/2027', emphasis: true }
        ]}
        identifiers={[{ label: 'Modalidade', value: 'Pregão' }]}
        identifiersTestId="ident"
      >
        <HealthTile label="Saldo contratável" value="R$ 1 mi" hint="contratado R$ 2 mi" onClick={() => undefined} testId="tile">
          <div data-testid="regua" />
        </HealthTile>
      </Instrument360Hero>
    </DockContext.Provider>
  );

describe('Instrument360Hero no celular (cartão resumido)', () => {
  it('no computador continua o cartão inteiro', () => {
    const html = render(false);
    expect(html).toContain('data-testid="ident"');
    expect(html).toContain('Assinatura');
    expect(html).not.toContain('instrument-360-mais-detalhes');
  });

  it('no celular mostra só a vigência, sem identificadores, e oferece "Mais detalhes"', () => {
    const html = render(true);
    expect(html).toContain('i360-hero--resumo');
    expect(html).toContain('08/09/2026 a 08/09/2027');
    expect(html).not.toContain('Assinatura');
    expect(html).not.toContain('Divulgação no PNCP');
    expect(html).not.toContain('data-testid="ident"');
    expect(html).toContain('data-testid="instrument-360-mais-detalhes"');
    expect(html).toContain('Registro de preços para aquisição de drones');
  });

  it('no celular o indicador mostra o valor sem dica nem régua, e continua clicável', () => {
    const html = render(true);
    expect(html).toContain('R$ 1 mi');
    expect(html).not.toContain('contratado R$ 2 mi');
    expect(html).not.toContain('data-testid="regua"');
    expect(html).toMatch(/<button[^>]*data-testid="tile"/);
  });
});

describe('HealthTile no resumo completo (leitura)', () => {
  it('mostra dica e régua, mas sem clique', () => {
    const html = renderToStaticMarkup(
      <HealthTileModeContext.Provider value="leitura">
        <HealthTile label="Saldo" value="R$ 1 mi" hint="contratado R$ 2 mi" onClick={() => undefined} testId="tile">
          <div data-testid="regua" />
        </HealthTile>
      </HealthTileModeContext.Provider>
    );
    expect(html).toContain('contratado R$ 2 mi');
    expect(html).toContain('data-testid="regua"');
    expect(html).not.toContain('<button');
  });
});
