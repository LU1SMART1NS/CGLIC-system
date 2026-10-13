import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AtaLinkedContracts } from '../AtaLinkedContracts';

vi.mock('../../../hooks/useDetailOrigin', () => ({ useNavigateWithOrigin: () => vi.fn() }));
// O aviso de vínculo a conferir consulta o banco; aqui não há marcas.
vi.mock('../../../hooks/useVinculosAConferir', () => ({
  useVinculosAConferir: () => ({ vinculos: [], porPar: new Map(), isLoading: false, podeDecidir: false, manter: { isPending: false }, retirar: { isPending: false } })
}));

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
  it('mostra quem fez o vínculo', () => {
    const auto = renderToStaticMarkup(<AtaLinkedContracts linkedContracts={[link({ origem: 'AUTOMATICO' })]} />);
    expect(auto).toContain('Vinculado pelo sistema');
    const manual = renderToStaticMarkup(<AtaLinkedContracts linkedContracts={[link({ origem: 'MANUAL' })]} />);
    expect(manual).toContain('Vinculado à mão');
    const porNome = renderToStaticMarkup(<AtaLinkedContracts linkedContracts={[link({ origem: 'MANUAL', criadoPorNome: 'Luís Martins', criadoEm: '2026-10-13T22:10:00Z' })]} />);
    expect(porNome).toContain('Vinculado por Luís Martins em 13/10/2026');
    expect(porNome).not.toContain('Obs.');
    // Observação digitada continua aparecendo, depois do nome.
    const comObs = renderToStaticMarkup(<AtaLinkedContracts linkedContracts={[link({ origem: 'MANUAL', criadoPorNome: 'Luís Martins', observacoes: 'Aditivo de 2025' })]} />);
    expect(comObs).toContain('Obs. Aditivo de 2025');
    const auto2 = renderToStaticMarkup(<AtaLinkedContracts linkedContracts={[link({ origem: 'AUTOMATICO', criadoPorNome: 'Luís Martins' })]} />);
    expect(auto2).not.toContain('Vinculado por');
    const semMigration = renderToStaticMarkup(<AtaLinkedContracts linkedContracts={[link()]} />);
    expect(semMigration).not.toContain('Vinculado');
  });
});
