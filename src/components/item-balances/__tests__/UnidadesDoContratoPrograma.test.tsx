/** Divisão do contrato pelas unidades com o programa de cada parte (migration 297). */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../../design-system/components/Modal', () => ({
  Modal: ({ title, children, footer }: any) => (
    <div>
      <h2>{title}</h2>
      {children}
      {footer}
    </div>
  )
}));
vi.mock('../../../hooks/useContratadoDoItem', () => ({
  useAcoesContratado: () => ({ dividir: { isPending: false, mutateAsync: vi.fn() }, desfazerDivisao: { isPending: false, mutateAsync: vi.fn() } })
}));
const gravados = vi.hoisted(() => ({ mapa: new Map<string, string | null>([['DGFNSP', 'p1']]) }));
vi.mock('../../../hooks/useProgramasDaAlocacao', () => ({
  useAlocacaoExtraDoItem: () => ({
    data: { divisao: 'NAO_DIVIDE', divisaoAssinada: {}, remanejamentos: [], reservas: [{ programaId: 'p1', nome: 'Pégasus', area: 'DGFNSP', quantidade: 200, contratado: 50, atualizadoPorNome: null, atualizadoEm: null }] }
  }),
  useProgramasDaDivisao: () => ({ data: gravados.mapa }),
  useLigarContratoAosProgramas: () => ({ isPending: false, mutateAsync: vi.fn() })
}));

const { UnidadesDoContratoModal } = await import('../UnidadesDoContratoModal');

const contrato = {
  contractKey: 'C1',
  numeroContrato: '12/2026',
  quantidade: {
    itemKey: 'I', contractKey: 'C1', quantidadeFonte: 100, fonte: null, fonteLidaEm: null, quantidadeAjustada: null, quantidadeContratada: 100,
    ajustada: false, ajusteJustificativa: null, ajusteQuantidadeFonte: null, ajustadoPorNome: null, ajustadoEm: null, fonteMudouAposAjuste: false,
    divisaoOrigem: 'USUARIO', divisaoQuantidadeBase: 100, divididoPorNome: null, divididoEm: null, quantidadeDividida: 100, quantidadeSemUnidade: 0,
    unidades: [{ unidade: 'DGFNSP', quantidade: 50, alocada: true }, { unidade: 'CAEP', quantidade: 50, alocada: true }], situacao: 'DIVIDIDA'
  }
} as any;
const render = () =>
  renderToStaticMarkup(
    <UnidadesDoContratoModal
      itemKey="00031/2025-200330-00001"
      tituloItem="Item 1"
      contrato={contrato}
      allocations={[{ id: 'a', unitName: 'DGFNSP', allocatedQty: 700, empenhadaQty: 0 }, { id: 'b', unitName: 'CAEP', allocatedQty: 500, empenhadaQty: 0 }]}
      unidades={[]}
      podeEditar
      onFechar={() => {}}
    />
  );

describe('Unidades do contrato × programa', () => {
  it('coluna Programa com os programas que têm reserva na unidade, e o gravado escolhido', () => {
    const html = render();
    expect(html).toContain('>Programa<');
    expect(html).toContain('data-testid="unidades-contrato-programa-DGFNSP"');
    expect(html).toContain('Pégasus · reserva 200');
    expect(html).toMatch(/<option value="p1" selected="">/);
  });
  it('unidade sem programa com reserva: sem escolha', () => {
    const html = render();
    expect(html).not.toContain('data-testid="unidades-contrato-programa-CAEP"');
  });
});
