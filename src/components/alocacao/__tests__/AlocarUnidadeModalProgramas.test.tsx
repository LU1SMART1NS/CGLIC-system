/**
 * Janela "Alocação do item" com programas (migrations 297/298): reservas sob a área responsável, reservado a
 * parlamentares e emendas sem pedido na CAEP, ata que divide travada (Remanejar com SEI) e histórico.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

const dados = vi.hoisted(() => ({
  extra: {
    divisao: 'DIVIDE',
    reservas: [{ programaId: 'p1', nome: 'Pégasus', area: 'DGFNSP', quantidade: 200, contratado: 50, atualizadoPorNome: null, atualizadoEm: null }],
    divisaoAssinada: { DGFNSP: 600, CAEP: 600 },
    remanejamentos: [{ de: 'CAEP', para: 'DGFNSP', quantidade: 100, sei: '28451237', observacao: 'pedido da área', feitoPorNome: 'Gestor A', feitoEm: '2026-11-05T10:00:00Z' }]
  } as any,
  alocacoes: [
    { id: 'a1', unitName: 'DGFNSP', allocatedQty: 700, empenhadaQty: 0 },
    { id: 'a2', unitName: 'CAEP', allocatedQty: 500, empenhadaQty: 0 }
  ]
}));

vi.mock('../../../design-system/components/Modal', () => ({
  Modal: ({ title, children, footer }: any) => (
    <div data-testid="modal">
      <h2>{title}</h2>
      {children}
      {footer}
    </div>
  )
}));
vi.mock('../../../hooks/useDepartments', () => ({
  useDepartments: () => ({ data: ['CAEP', 'DGFNSP', 'DFNSP'].map((s) => ({ id: s, sigla: s, nomeCompleto: s, ativo: true })), isLoading: false })
}));
const pronta = (data: unknown) => ({ data, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() });
vi.mock('../../../hooks/useItemAllocations', () => ({ useItemAllocations: () => pronta({ allocations: dados.alocacoes, version: 3 }) }));
vi.mock('../../../hooks/useItemEmpenhoLinks', () => ({ useItemEmpenhoLinks: () => pronta({ links: {}, version: 1 }) }));
vi.mock('../../../hooks/useEmpenhoDoItem', () => ({ useEmpenhoDoItem: () => ({ data: { porContrato: new Map(), parcelas: [], empenhado: 0, aVincular: [], contratosSemItens: 0 }, isLoading: false }) }));
vi.mock('../../../hooks/useContratadoDoItem', () => ({ useContratadoDoItem: () => ({ ...pronta({ contratos: [], unidades: [{ unitName: 'DGFNSP', quantidadeContratada: 200 }] }) }) }));
vi.mock('../../../hooks/useReservaDoItem', () => ({ useReservaDoItem: () => pronta({ total: 120, semContrato: 120 }) }));
vi.mock('../../../hooks/useSaveAllocations', () => ({ useSaveAllocations: () => ({ isPending: false, mutateAsync: vi.fn() }) }));
vi.mock('../../../hooks/useSaveEmpenhoLinks', () => ({ useSaveEmpenhoLinks: () => ({ isPending: false, mutateAsync: vi.fn() }) }));
vi.mock('../../../hooks/useAtasAMontar', () => ({ useDivisoesDasAtasMontadas: () => new Map() }));
vi.mock('../../../hooks/useProgramasDaAlocacao', () => ({
  useAlocacaoExtraDoItem: () => pronta(dados.extra),
  useProgramasParaAlocacao: () => pronta([{ id: 'p0', nome: 'ComprasSUSP', area: 'CAEP', ativo: true, emendas: true }, { id: 'p1', nome: 'Pégasus', area: 'DGFNSP', ativo: true, emendas: false }]),
  useReservarParaPrograma: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useRemanejarEntreUnidades: () => ({ isPending: false, mutateAsync: vi.fn() })
}));

const { AlocarUnidadeModal } = await import('../AlocarUnidadeModal');
const render = (extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <AlocarUnidadeModal item={{ numeroAta: '00051/2024', uasg: '200331', numeroItem: '00001', quantitativoSenasp: 1200, ...extra }} onFechar={() => {}} />
    </MemoryRouter>
  );

describe('Alocação do item com programas', () => {
  it('programa sob a área, com contratado e reservado sem contrato', () => {
    const html = render();
    expect(html).toContain('data-testid="alocar-linha-programa-p1"');
    expect(html).toContain('Pégasus');
    expect(html).toContain('reserva 200');
    // DGFNSP: 700 − (200 contratados + 150 reservados sem contrato) = 350 livres.
    expect(html).toMatch(/data-testid="alocar-unidade-livre-DGFNSP"[^>]*>350/);
  });

  it('CAEP: reservado a parlamentares (automático) e livre como emendas sem pedido', () => {
    const html = render();
    expect(html).toContain('data-testid="alocar-linha-parlamentares"');
    expect(html).toContain('120 nos pedidos de emenda (automático)');
    expect(html).toMatch(/data-testid="alocar-unidade-livre-CAEP"[^>]*>380/);
    expect(html).toContain('emendas sem pedido');
  });

  it('ata que divide: quantidades travadas, "difere da ata" e histórico com SEI', () => {
    const html = render({ divisaoNaAta: 'DIVIDE' });
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*data-testid="alocar-unidade-qtd-DGFNSP"/);
    expect(html).toContain('difere da ata (600)');
    expect(html).toContain('data-testid="alocar-historico-remanejamentos"');
    expect(html).toContain('28451237');
    expect(html).toContain('Remanejar entre unidades');
    expect(html).toContain('Reservar para um programa');
  });

  it('ata sem divisão: quantidades editáveis e aviso de alocação opcional', () => {
    const html = render({ divisaoNaAta: 'NAO_DIVIDE', semDivisaoNaAta: true });
    expect(html).not.toMatch(/<input[^>]*disabled=""[^>]*data-testid="alocar-unidade-qtd-DGFNSP"/);
    expect(html).toContain('data-testid="alocar-sem-divisao"');
  });
});
