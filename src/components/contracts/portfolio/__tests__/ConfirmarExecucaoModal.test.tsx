import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ExecucaoDoContrato } from '../../../../utils/contratoExecutado';
import type { EntregaDaExecucao } from '../../../../services/contratoExecucaoService';

// O Modal usa portal (document); aqui ele só desenha título, corpo e rodapé no lugar.
vi.mock('../../../../design-system', async (orig) => ({
  ...(await orig<typeof import('../../../../design-system')>()),
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  Modal: ({ isOpen, title, footer, children }: any) =>
    isOpen ? (
      <div>
        <h2>{title}</h2>
        {children}
        <footer>{footer}</footer>
      </div>
    ) : null
}));
vi.mock('../../../../design-system/components/Modal', () => ({
  Modal: ({ isOpen, title, footer, children }: any) =>
    isOpen ? (
      <div>
        <h2>{title}</h2>
        {children}
        <footer>{footer}</footer>
      </div>
    ) : null
}));
const mutacao = { isPending: false, mutateAsync: vi.fn() };
vi.mock('../../../../hooks/useContratosExecucao', () => ({
  useContratosExecucao: () => ({ confirmar: mutacao, naoTerminou: mutacao, desfazer: mutacao })
}));
let entregas: EntregaDaExecucao[] = [];
vi.mock('@tanstack/react-query', async (orig) => ({
  ...(await orig<typeof import('@tanstack/react-query')>()),
  useQuery: ({ enabled }: { enabled: boolean }) => ({ data: enabled ? entregas : undefined, isLoading: false, isError: false })
}));
import { ConfirmarExecucaoModal } from '../ConfirmarExecucaoModal';

const execucao = (over: Partial<ExecucaoDoContrato> = {}): ExecucaoDoContrato => ({
  contractKey: '200331-00010-2025',
  valorGlobal: 1000,
  faturado: 1000,
  faturasAbertas: 0,
  saldoEmpenho: 0,
  fiscalizacao: 'FINALIZADA',
  estado: 'SUGERIDO',
  decisaoSuperada: false,
  ...over
});
const entrega = (over: Partial<EntregaDaExecucao> = {}): EntregaDaExecucao => ({
  id: 'e1', item: 'Colete balístico', beneficiario: 'PMPI', municipio: 'Teresina', uf: 'PI', quantidade: 50,
  etapa: 'FINALIZADO', etapaEm: '2026-10-01', trdSei: null, trdEm: null, ...over
});
const render = (e = execucao()) =>
  renderToStaticMarkup(<ConfirmarExecucaoModal isOpen numero="00010/2025" execucao={e} onClose={vi.fn()} />);

describe('ConfirmarExecucaoModal (o gestor confere e confirma, sem SEI)', () => {
  it('não pede SEI nem data do recebimento', () => {
    entregas = [];
    const html = render();
    expect(html).not.toContain('execucao-sei');
    expect(html).not.toContain('Documento SEI');
    expect(html).toContain('Confirmar escopo cumprido');
  });

  it('na Fiscalização, lista as entregas com o TRD do fiscal ou a etapa', () => {
    entregas = [entrega(), entrega({ id: 'e2', item: 'Capacete', trdSei: '34152364', trdEm: '2026-09-15' })];
    const html = render();
    expect(html).toContain('Entregas na Fiscalização');
    expect(html).toContain('1 de 2 com recebimento definitivo registrado');
    expect(html).toContain('Colete balístico');
    expect(html).toContain('PMPI · Teresina/PI');
    expect(html).toContain('Finalizado');
    expect(html).toContain('execucao-entrega-trd');
  });

  it('fora da Fiscalização, só os pagamentos', () => {
    entregas = [entrega()];
    const html = render(execucao({ fiscalizacao: 'SEM' }));
    expect(html).not.toContain('Entregas na Fiscalização');
    expect(html).toContain('Fora da Fiscalização: confira pelos pagamentos');
  });

  it('confirmação antiga mostra o SEI que o gestor informou; a nova, só quem confirmou', () => {
    entregas = [];
    const antiga = render(execucao({ estado: 'EXECUTADO', confirmado: { em: '2026-11-16', por: 'Ana', sei: '1234567', dataRecebimento: '2026-11-10' } }));
    expect(antiga).toContain('Recebimento definitivo em');
    const nova = render(execucao({ estado: 'EXECUTADO', confirmado: { em: '2026-11-17', por: 'Ana', sei: '', dataRecebimento: '' } }));
    expect(nova).toContain('Confirmado por');
    expect(nova).not.toContain('Recebimento definitivo em');
  });
});
