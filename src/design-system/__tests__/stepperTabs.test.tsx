import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkflowStepper } from '../components/WorkflowStepper';
import { Tabs } from '../components/Tabs';

const steps = [
  { id: 'a', title: 'Recebido', state: 'COMPLETED' as const },
  { id: 'b', title: 'Conferido', state: 'CURRENT' as const }
];
const mockMobile = (isMobile: boolean) =>
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: isMobile, addEventListener: () => {}, removeEventListener: () => {} })
  });

describe('WorkflowStepper orientation="auto"', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('é horizontal no desktop e vertical abaixo de 768px', () => {
    mockMobile(false);
    expect(renderToStaticMarkup(<WorkflowStepper steps={steps} />)).toContain('flex-direction:row');
    mockMobile(true);
    const html = renderToStaticMarkup(<WorkflowStepper steps={steps} />);
    expect(html).toContain('flex-direction:column');
    expect(html).not.toContain('min-width:120px');
  });

  it('orientação explícita ignora a largura da tela', () => {
    mockMobile(true);
    expect(renderToStaticMarkup(<WorkflowStepper steps={steps} orientation="horizontal" />)).toContain('min-width:120px');
  });
});

describe('Tabs roláveis', () => {
  it('usa a classe de rolagem horizontal e mantém os papéis ARIA', () => {
    const html = renderToStaticMarkup(
      <Tabs tabs={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} activeTabId="a" onTabChange={() => {}} />
    );
    expect(html).toContain('ds-tabs-scroll');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
  });
});
