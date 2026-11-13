/** Cadastro do programa sem a origem do recurso (decisão de 13/11/2026; a fonte não é registrada). */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../../design-system/components/Modal', () => ({ Modal: ({ children, footer }: any) => <div>{children}{footer}</div> }));
vi.mock('../../../hooks/useFiscalizacao', () => ({ useSalvarProgramaFiscalizacao: () => ({ isPending: false, mutateAsync: vi.fn() }) }));
vi.mock('../../../hooks/useDepartments', () => ({ useDepartments: () => ({ data: [{ id: 'd1', sigla: 'CAEP', nomeCompleto: 'CAEP', ativo: true }] }) }));

const { ProgramaModal } = await import('../ProgramaModal');

describe('ProgramaModal', () => {
  it('pede nome e área responsável, sem origem do recurso', () => {
    const html = renderToStaticMarkup(<ProgramaModal onClose={() => {}} />);
    expect(html).toContain('data-testid="fisc-programa-nome"');
    expect(html).toContain('data-testid="fisc-programa-area"');
    expect(html).not.toContain('fisc-programa-origem');
    expect(html).not.toContain('Origem do recurso');
  });
});
