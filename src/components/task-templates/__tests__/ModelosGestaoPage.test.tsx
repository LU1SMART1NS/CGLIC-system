import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../../design-system';
import { ModelosGestaoPage, parseModelosGestaoTipo } from '../ModelosGestaoPage';

const empty = { data: [], isLoading: false, error: null };
const mutation = { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null };

vi.mock('../../../hooks/useAtaTaskTemplates', () => ({ useAtaTaskTemplates: () => empty }));
vi.mock('../../../hooks/useContractTaskTemplates', () => ({ useContractTaskTemplates: () => empty }));
vi.mock('../../../hooks/useSaveAtaTaskTemplate', () => ({ useSaveAtaTaskTemplate: () => mutation }));
vi.mock('../../../hooks/useDeleteAtaTaskTemplate', () => ({ useDeleteAtaTaskTemplate: () => mutation }));
vi.mock('../../../hooks/useSaveAtaTaskTemplateMacrotask', () => ({ useSaveAtaTaskTemplateMacrotask: () => mutation }));
vi.mock('../../../hooks/useDeleteAtaTaskTemplateMacrotask', () => ({ useDeleteAtaTaskTemplateMacrotask: () => mutation }));
vi.mock('../../../hooks/useSaveAtaTaskTemplateTask', () => ({ useSaveAtaTaskTemplateTask: () => mutation }));
vi.mock('../../../hooks/useDeleteAtaTaskTemplateTask', () => ({ useDeleteAtaTaskTemplateTask: () => mutation }));
vi.mock('../../../hooks/useSaveContractTaskTemplate', () => ({ useSaveContractTaskTemplate: () => mutation }));
vi.mock('../../../hooks/useDeleteContractTaskTemplate', () => ({ useDeleteContractTaskTemplate: () => mutation }));
vi.mock('../../../hooks/useSaveContractTaskTemplateMacrotask', () => ({ useSaveContractTaskTemplateMacrotask: () => mutation }));
vi.mock('../../../hooks/useDeleteContractTaskTemplateMacrotask', () => ({ useDeleteContractTaskTemplateMacrotask: () => mutation }));
vi.mock('../../../hooks/useSaveContractTaskTemplateTask', () => ({ useSaveContractTaskTemplateTask: () => mutation }));
vi.mock('../../../hooks/useDeleteContractTaskTemplateTask', () => ({ useDeleteContractTaskTemplateTask: () => mutation }));

const render = (url: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <ModelosGestaoPage />
      </ToastProvider>
    </MemoryRouter>
  );

describe('ModelosGestaoPage (abas Atas e Contratos)', () => {
  it('abre em Atas por padrão e mantém o painel de Contratos oculto', () => {
    const html = render('/configuracoes/modelos');
    expect(html).toMatch(/id="modelos-tab-atas"[^>]*aria-selected="true"/);
    expect(html).toMatch(/id="modelos-tab-contratos"[^>]*aria-selected="false"/);
    expect(html).toMatch(/id="modelos-panel-contratos"[^>]*hidden/);
    expect(html).not.toMatch(/id="modelos-panel-atas"[^>]*hidden/);
  });

  it('?tipo=contratos abre a aba de Contratos', () => {
    const html = render('/configuracoes/modelos?tipo=contratos');
    expect(html).toMatch(/id="modelos-tab-contratos"[^>]*aria-selected="true"/);
    expect(html).toMatch(/id="modelos-panel-atas"[^>]*hidden/);
  });

  it('mostra um único título de página, sem o cabeçalho de cada tipo', () => {
    const html = render('/configuracoes/modelos');
    expect(html).toContain('Modelos de Gestão');
    expect(html).not.toContain('Modelos de Gestão de Atas');
  });

  it('valor de tipo desconhecido cai em Atas', () => {
    expect(parseModelosGestaoTipo('xpto')).toBe('atas');
    expect(parseModelosGestaoTipo(null)).toBe('atas');
    expect(parseModelosGestaoTipo('contratos')).toBe('contratos');
  });
});
