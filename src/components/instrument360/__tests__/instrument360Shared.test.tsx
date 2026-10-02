import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Instrument360Page } from '../Instrument360Page';
import { Instrument360TabPanel } from '../Instrument360TabPanel';
import { InstrumentSection } from '../InstrumentSection';
import { resolveInstrumentTab, tabSearchParams } from '../useInstrumentTab';
import { Receipt } from 'lucide-react';

const TABS = ['acoes', 'plano', 'itens'] as const;

describe('resolveInstrumentTab / tabSearchParams', () => {
  it('usa a aba da URL quando ela existe; senão, a padrão', () => {
    expect(resolveInstrumentTab('itens', TABS, 'acoes')).toBe('itens');
    expect(resolveInstrumentTab('inexistente', TABS, 'acoes')).toBe('acoes');
    expect(resolveInstrumentTab(null, TABS, 'acoes')).toBe('acoes');
  });

  it('nomes antigos de aba levam à aba nova', () => {
    expect(resolveInstrumentTab('empenhos', ['unidades', 'contratos'] as const, 'unidades', { empenhos: 'contratos' })).toBe('contratos');
  });

  it('a aba padrão fica fora do endereço', () => {
    expect(tabSearchParams('acoes', 'acoes')).toEqual({});
    expect(tabSearchParams('plano', 'acoes')).toEqual({ aba: 'plano' });
  });
});

describe('Instrument360Page', () => {
  it('é a mesma casca para todas as telas', () => {
    const html = renderToStaticMarkup(<Instrument360Page>x</Instrument360Page>);
    expect(html).toContain('max-width:1400px');
    expect(html).toContain('padding:1.5rem');
  });
});

describe('Instrument360TabPanel', () => {
  it('é o tabpanel da aba ativa, ligado pelo prefixo da tela', () => {
    for (const prefix of ['ata', 'contract', 'item']) {
      const html = renderToStaticMarkup(<Instrument360TabPanel idPrefix={prefix} activeTab="plano">x</Instrument360TabPanel>);
      expect(html).toContain(`id="${prefix}-tabpanel-plano"`);
      expect(html).toContain(`aria-labelledby="${prefix}-tab-plano"`);
      expect(html).toContain('role="tabpanel"');
    }
  });

  it('o quadro é o mesmo quadro cinza em qualquer tela, com altura mínima', () => {
    const estilo = (prefix: string) => /style="([^"]*)"/.exec(renderToStaticMarkup(<Instrument360TabPanel idPrefix={prefix} activeTab="a">x</Instrument360TabPanel>))![1];
    expect(estilo('ata')).toBe(estilo('item'));
    expect(estilo('ata')).toContain('background:#f8fafc');
    expect(estilo('ata')).toContain('border-radius:8px');
    expect(estilo('ata')).not.toContain('box-shadow');
    expect(estilo('ata')).toContain('min-height:28rem');
  });
});

describe('InstrumentSection', () => {
  it('usa o cabeçalho de seção do design system, com ícone, contagem e ações', () => {
    const html = renderToStaticMarkup(
      <InstrumentSection id="sec" title="Execução financeira" subtitle="Empenhos emitidos" icon={Receipt} count={4} actions={<button>Atualizar</button>}>
        corpo
      </InstrumentSection>
    );
    expect(html).toContain('id="sec"');
    expect(html).toContain('data-testid="section-header"');
    expect(html).toContain('Execução financeira');
    expect(html).toContain('Empenhos emitidos');
    expect(html).toContain('Atualizar');
    expect(html).toContain('corpo');
    expect(html).not.toContain('box-shadow');
  });
});
