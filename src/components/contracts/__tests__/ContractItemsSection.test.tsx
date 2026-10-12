import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractItemsSection } from '../ContractItemsSection';
import type { ItensDoContrato } from '../../../services/itensContratoService';
import { mapQuantidadeDoContrato } from '../../../services/contratadoUnidadeService';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()]
}));

// Quantidade usada no saldo de cada item da ata (migration 103), simulada por teste.
let contratadoSimulado: { porItem: any[]; saldoPorItem: Map<string, any> } = { porItem: [], saldoPorItem: new Map() };
vi.mock('../../../hooks/useContratadoDoItem', () => ({
  useContratadoDoContrato: () => ({ data: contratadoSimulado }),
  useAcoesContratado: () => ({}),
  useAjustesDaQuantidade: () => ({ data: [] })
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
const render = (dados: ItensDoContrato | undefined, extra: { isLoading?: boolean; error?: Error; podeAjustar?: boolean } = {}) =>
  renderToStaticMarkup(
    <ContractItemsSection dados={dados} isLoading={Boolean(extra.isLoading)} error={extra.error} contractKey="200331-00012-2025" podeAjustar={extra.podeAjustar} />
  );
const quantidade = (itemKey: string, over: Record<string, unknown> = {}) =>
  mapQuantidadeDoContrato({
    item_key: itemKey,
    contract_key: '200331-00012-2025',
    quantidade_fonte: 27,
    fonte: 'CONTRATOS_GOV',
    quantidade_contratada: 27,
    ajustada: false,
    quantidade_dividida: 0,
    quantidade_sem_unidade: 27,
    situacao_divisao: 'SEM_DIVISAO',
    unidades: [],
    ...over
  });

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

  describe('quantidade contratada ajustada (migration 103)', () => {
    it('item vinculado sem ajuste: só o número, e o Ajustar para gestor e coordenador', () => {
      contratadoSimulado = { porItem: [quantidade(vinculo(4).itemKey)], saldoPorItem: new Map() };
      const leitor = render({ leitura, itens, vinculos: [vinculo(4)] });
      expect(leitor).toContain('qtd-contratada-200331-00012-2025');
      expect(leitor).not.toContain('do Contratos.gov.br');
      expect(leitor).not.toContain('Ajustar');
      expect(render({ leitura, itens, vinculos: [vinculo(4)] }, { podeAjustar: true })).toContain('Ajustar');
    });

    it('item com ajuste: a quantidade usada, a tag e o número da fonte embaixo', () => {
      contratadoSimulado = {
        porItem: [quantidade(vinculo(4).itemKey, { quantidade_ajustada: 30, quantidade_contratada: 30, ajustada: true, ajuste_quantidade_fonte: 27 })],
        saldoPorItem: new Map()
      };
      const html = render({ leitura, itens, vinculos: [vinculo(4)] }, { podeAjustar: true });
      expect(html).toContain('>30<');
      expect(html).toContain('Ajustada');
      expect(html).toContain('No Contratos.gov.br: 27');
    });

    it('contrato sem itens na fonte, mas vinculado: lista os itens da ata com a quantidade e o Ajustar', () => {
      contratadoSimulado = {
        porItem: [quantidade(vinculo(4).itemKey, { quantidade_fonte: null, quantidade_contratada: null, situacao_divisao: 'SEM_QUANTIDADE', quantidade_sem_unidade: 0 })],
        saldoPorItem: new Map([[vinculo(4).itemKey, { itemKey: vinculo(4).itemKey, descricao: 'CARRETA REBOQUE', cota: 100, consumo: 0 }]])
      };
      const html = render({ leitura: { ...leitura, totalItens: 0, fonte: null }, itens: [], vinculos: [vinculo(4)] }, { podeAjustar: true });
      expect(html).toContain('contract-items-empty-with-links');
      expect(html).toContain('Ata 00067/2025 · Item 00004');
      expect(html).toContain('No Contratos.gov.br: sem o item');
      expect(html).toContain('Ajustar');
      expect(html).not.toContain('contract-items-empty"');
    });
  });
});
