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
      empenhadoOutras={new Map([[13, 26]])}
      isLoading={false}
      onSalvar={vi.fn()}
      onFechar={vi.fn()}
      {...extra}
    />
  );

describe('DistribuirEmpenhoModal (vínculo por quantidade)', () => {
  it('nula não abre', () => {
    expect(render(null as any)).toBe('');
  });

  it('mostra a nota, um campo de quantidade por item e o saldo a empenhar; sem preço nem valor da nota', () => {
    const html = render();
    expect(html).toContain('Vincular 2024NE000337 aos itens');
    expect(html).toContain('Contrato 00002/2025');
    expect(html).toContain('distribuir-quantidade-13');
    expect(html).toContain('distribuir-quantidade-43');
    expect(html).toContain('Saldo a empenhar');
    expect(html).toContain('53 un');
    expect(html).toContain('Contratado 79 · Empenhado 26');
    expect(html).not.toContain('R$');
    expect(html).not.toContain('Valor da nota');
    expect(html).not.toContain('Nesta nota');
    expect(html).not.toContain('Tudo aqui');
    expect(html).not.toContain('Distribu');
  });

  it('sugestão única já vem preenchida, sem o marcador Informada, e permite salvar', () => {
    const html = render();
    expect(html).toContain('Usar sugestão: 342 un do item 43');
    expect(html).toMatch(/data-testid="distribuir-quantidade-43"[^>]*value="342"/);
    expect(html).not.toContain('distribuir-informada-43');
    expect(html).toContain('1 de 2');
    expect(html).not.toMatch(/aria-disabled="true"[^>]*data-testid="distribuir-salvar"/);
  });

  it('sem sugestão: nenhum item com quantidade e salvar fica desligado', () => {
    const html = render(nota({ sugestao_tipo: 'SEM_SUGESTAO', sugestao: [] }));
    expect(html).toContain('Informe a quantidade em pelo menos um item');
    expect(html).toMatch(/aria-disabled="true"[^>]*data-testid="distribuir-salvar"/);
  });

  it('editar o vínculo: abre com as quantidades atuais, marca as informadas e avisa o que passa do saldo', () => {
    const html = render(
      nota({ situacao: 'DISTRIBUIDA', origem: 'USUARIO', distribuido_por_nome: 'Maria', parcelas: [{ numero_item: 13, valor: null, quantidade_informada: 60 }, { numero_item: 43, valor: 7000 }] })
    );
    expect(html).toMatch(/data-testid="distribuir-quantidade-13"[^>]*value="60"/);
    expect(html).toMatch(/data-testid="distribuir-quantidade-43"[^>]*value="2"/);
    expect(html).toContain('distribuir-informada-13');
    expect(html).toContain('Passa do saldo em 7 un');
    expect(html).toContain('1 item acima do saldo a empenhar');
    expect(html).toContain('Vinculada aos itens por Maria');
  });

  it('mais de uma possibilidade: um botão por opção', () => {
    const html = render(nota({ sugestao_tipo: 'VARIAS_POSSIBILIDADES', sugestao: [{ numero_item: 13, quantidade: 7 }, { numero_item: 43, quantidade: 9 }] }));
    expect(html).toContain('7 un do item 13');
    expect(html).toContain('9 un do item 43');
    expect(html).not.toContain('Usar sugestão');
  });

  it('erro do banco aparece na janela', () => {
    expect(render(nota(), { erro: 'A quantidade do item 13 precisa ser um número inteiro maior que zero.' })).toContain('precisa ser um número inteiro');
  });
});
