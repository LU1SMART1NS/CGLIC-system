import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// O Modal usa portal (document); aqui ele só desenha título, corpo e rodapé no lugar.
vi.mock('../../../design-system', async (orig) => ({
  ...(await orig<typeof import('../../../design-system')>()),
  Modal: ({ isOpen, title, subtitle, footer, children }: any) =>
    isOpen ? (
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
        {children}
        <footer>{footer}</footer>
      </div>
    ) : null
}));
import { DistribuirEmpenhoModal } from '../DistribuirEmpenhoModal';
import { mapDistribuicao } from '../../../services/distribuicaoEmpenhoService';

const itens = [
  { numeroItem: 13, descricao: 'Placa balística', tipo: 'Material', quantidade: 79, valorUnitario: 4900, valorTotal: 387100 },
  { numeroItem: 43, descricao: 'Capacete balístico', tipo: 'Material', quantidade: 342, valorUnitario: 3500, valorTotal: 1197000 }
];
const nota = (over: any = {}) =>
  mapDistribuicao({
    contrato_empenho_id: 'ce', empenho_id: 'e', numero_oficial: '2024NE000337', valor_nota: 1197000, situacao: 'A_DISTRIBUIR',
    sugestao_tipo: 'TOTAL_DO_ITEM', sugestao: [{ numero_item: 43, quantidade: 342 }], parcelas: [], ...over
  });
const render = (d = nota(), extra: any = {}) =>
  renderToStaticMarkup(
    <DistribuirEmpenhoModal
      distribuicao={d}
      numeroContrato="00002/2025"
      itens={itens}
      empenhadoOutras={new Map([[13, 127400]])}
      isLoading={false}
      onSalvar={vi.fn()}
      onFechar={vi.fn()}
      {...extra}
    />
  );

describe('DistribuirEmpenhoModal', () => {
  it('nula não abre', () => {
    expect(render(null as any)).toBe('');
  });

  it('mostra a nota, a sugestão, um campo por item e o que já veio de outras notas', () => {
    const html = render();
    expect(html).toContain('Vincular 2024NE000337 aos itens do contrato');
    expect(html).toContain('Salvar o vínculo');
    expect(html).not.toContain('Distribu');
    expect(html).toContain('Contrato 00002/2025');
    expect(html).toContain('Igual ao total do item 43');
    expect(html).toContain('distribuir-valor-13');
    expect(html).toContain('distribuir-valor-43');
    expect(html).toMatch(/R\$\s127\.400,00/);
  });

  it('sem valores, falta a nota inteira e salvar fica desligado', () => {
    const html = render();
    expect(html).toMatch(/falta R\$\s1\.197\.000,00/);
    expect(html).toMatch(/aria-disabled="true"[^>]*data-testid="distribuir-salvar"/);
  });

  it('mais de uma possibilidade: avisa que o gestor escolhe', () => {
    const html = render(nota({ sugestao_tipo: 'VARIAS_POSSIBILIDADES', sugestao: [{ numero_item: 13, quantidade: 7 }, { numero_item: 43, quantidade: 9 }] }));
    expect(html).toContain('7 un do item 13');
    expect(html).toContain('Mais de uma possibilidade');
  });

  it('erro do banco aparece na janela', () => {
    expect(render(nota(), { erro: 'O valor do empenho agora é 10.' })).toContain('O valor do empenho agora é 10.');
  });
});
