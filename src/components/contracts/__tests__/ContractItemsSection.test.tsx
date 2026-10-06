import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractItemsSection } from '../ContractItemsSection';
import type { ItensDoContrato } from '../../../services/itensContratoService';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()]
}));

const leitura = { lidoEm: '2026-10-06T15:20:00Z', totalItens: 2, fonte: 'CONTRATOS_GOV' as const };
const itens = [
  { posicao: 1, numeroItem: 4, descricao: 'CARRETA REBOQUE', tipo: 'Material', quantidade: 27, valorUnitario: 21357.95, valorTotal: 576664.65 },
  { posicao: 2, numeroItem: 5, descricao: 'QUADRICICLO', tipo: 'Material', quantidade: 2, valorUnitario: 1000, valorTotal: 2000 }
];
const vinculo = (numeroItem: number) => ({
  itemKey: `00067/2025-200331-${String(numeroItem).padStart(5, '0')}`,
  numeroAta: '00067/2025',
  uasgAta: '200331',
  numeroItem
});
const render = (dados: ItensDoContrato | undefined, extra: { isLoading?: boolean; error?: Error } = {}) =>
  renderToStaticMarkup(<ContractItemsSection dados={dados} isLoading={Boolean(extra.isLoading)} error={extra.error} />);

describe('ContractItemsSection', () => {
  it('itens ainda não lidos: explica que a sincronização vai trazer', () => {
    expect(render({ leitura: null, itens: [], vinculos: [] })).toContain('contract-items-not-read');
  });

  it('lido e sem itens: diz que as fontes não informam itens', () => {
    expect(render({ leitura: { ...leitura, totalItens: 0, fonte: null }, itens: [], vinculos: [] })).toContain('contract-items-empty');
  });

  it('carregando e erro', () => {
    expect(render(undefined, { isLoading: true })).toContain('contract-items-loading');
    expect(render(undefined, { error: new Error('falhou') })).toContain('contract-items-error');
  });

  it('mostra os itens, o total e o item da ata vinculado', () => {
    const html = render({ leitura, itens, vinculos: [vinculo(4)] });
    expect(html).toContain('CARRETA REBOQUE');
    expect(html).toContain('Ata 00067/2025 · Item 00004');
    expect(html).toContain('Sem vínculo');
    expect(html).toContain('contract-item-link-1');
    expect(html).not.toContain('contract-item-link-2');
    expect(html).toMatch(/data-testid="contract-item-row-1"[^>]*class="carteira-row-link"|class="carteira-row-link"[^>]*data-testid="contract-item-row-1"/);
    expect(html).not.toMatch(/data-testid="contract-item-row-2"[^>]*carteira-row-link/);
    // Com vínculo o número aparece só na coluna da ata; sem vínculo (item 5), aparece junto da descrição.
    expect(html).not.toContain('>00004<');
    expect(html).toContain('>00005<');
    expect(html).toMatch(/data-testid="contract-items-total"[^>]*>R\$\s578\.664,65/);
    expect(html).not.toContain('contract-items-source');
    expect(html).not.toContain('contract-items-no-links');
  });

  it('avisa o vínculo que aponta para um item que o contrato não tem', () => {
    const html = render({ leitura, itens, vinculos: [vinculo(4), vinculo(9)] });
    expect(html).toContain('contract-items-orphan-links');
    expect(html).toContain('Ata 00067/2025 · Item 00009');
  });

  it('contrato sem nenhum vínculo: orienta o vínculo na Ata 360', () => {
    expect(render({ leitura, itens, vinculos: [] })).toContain('contract-items-no-links');
  });
});
