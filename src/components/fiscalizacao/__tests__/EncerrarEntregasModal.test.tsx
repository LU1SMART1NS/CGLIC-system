import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../../design-system/components/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../../design-system/components/Modal', () => ({
  Modal: ({ title, children, footer }: { title: string; children: React.ReactNode; footer: React.ReactNode }) => (
    <div>
      <h2>{title}</h2>
      {children}
      {footer}
    </div>
  )
}));
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { linhaParaEntrega } from '../../../services/fiscalizacaoService';
import { EncerrarEntregasModal } from '../EntregasModais';

const entrega = linhaParaEntrega({
  id: 'e1', contract_key: '200331-00055-2026', contrato_numero: '00055/2026', quantidade: 10, origem: 'EMENDA', responsavel: 'SFC',
  etapa: 'ORDEM', fiscalizacao: 'SFC', beneficiario_texto: 'PM-XX', item_texto: 'Rádio portátil',
  aviso: { tipo: 'ITEM_CANCELADO', data: '2026-11-10', sei: '41234567' }
});

describe('janela Encerrar a entrega (migration 274)', () => {
  it('mostra o aviso, o motivo já escolhido e o SEI da anulação', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <EncerrarEntregasModal entregas={[entrega]} onClose={() => {}} />
      </QueryClientProvider>
    );
    expect(html).toContain('Encerrar a entrega');
    expect(html).toContain('Empenho anulado no pedido em 10/11/2026 · SEI 41234567: o item foi cancelado.');
    expect(html).toMatch(/<option value="ITEM_CANCELADO" selected="">/);
    expect(html).toContain('value="41234567"');
    expect(html).toContain('A entrega sai das listas de trabalho e o motivo fica no histórico.');
    expect(html).toContain('Encerrar entrega');
  });
});
