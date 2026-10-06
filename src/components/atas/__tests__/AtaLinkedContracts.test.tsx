import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AtaLinkedContracts } from '../AtaLinkedContracts';

vi.mock('../../../hooks/useDetailOrigin', () => ({ useNavigateWithOrigin: () => vi.fn() }));

const link = (over: Record<string, unknown> = {}) => ({
  linkId: 'l1',
  itemKey: '00067/2025-200331-00004',
  contractKey: '200331-00173-2026',
  numeroContratoFormatado: '00173/2026',
  fornecedorNome: 'ACN COMERCIO',
  valorGlobal: 576664.65,
  isOficial: true,
  ...over
}) as any;

describe('AtaLinkedContracts', () => {
  it('contrato oficial: a linha abre o contrato (mão, seta e número como link), sem botão de olho', () => {
    const html = renderToStaticMarkup(<AtaLinkedContracts linkedContracts={[link()]} onUnlink={vi.fn()} />);
    expect(html).toContain('action-row--go');
    expect(html).toContain('ata-linked-contract-open');
    expect(html).toContain('action-row__go');
    expect(html).not.toContain('aria-label="Ver detalhes do contrato"');
    // A linha tem o botão de desvincular: não é um botão aninhado.
    expect(html).not.toContain('role="button"');
    expect(html).toContain('Desvincular contrato deste item da ata');
  });

  it('contrato sem página (não oficial): linha sem clique, sem link e sem seta', () => {
    const html = renderToStaticMarkup(<AtaLinkedContracts linkedContracts={[link({ isOficial: false })]} />);
    expect(html).not.toContain('action-row--go');
    expect(html).not.toContain('ata-linked-contract-open');
    expect(html).not.toContain('action-row__go');
    expect(html).toContain('00173/2026');
  });
});
