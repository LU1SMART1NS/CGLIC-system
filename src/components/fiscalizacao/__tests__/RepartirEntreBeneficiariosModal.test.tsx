import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../../design-system/components/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../../design-system/components/Modal', () => ({
  Modal: ({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) => (
    <div>
      <h2>{title}</h2>
      <p>{subtitle}</p>
      {children}
      {footer}
    </div>
  )
}));
vi.mock('../../../hooks/useEmendas', () => ({ useBeneficiariosEmendas: () => ({ data: [], isLoading: false }) }));
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { linhaParaEntrega } from '../../../services/fiscalizacaoService';
import { RepartirEntreBeneficiariosModal } from '../RepartirEntreBeneficiariosModal';

const entrega = linhaParaEntrega({
  id: 'e1', contract_key: '200331-00331-2026', contrato_numero: '00331/2026', quantidade: 21, origem: 'CARGA', responsavel: 'SFC',
  etapa: 'INFO_PEDIDA', fiscalizacao: 'SFC', beneficiario_id: 'b-dfnsp', beneficiario_nome: 'Diretoria da Força Nacional de Segurança Pública',
  beneficiario_sigla: 'DFNSP', municipio: 'Brasília', uf: 'DF', item_nome: 'Curso / Aperfeiçoamento - Pilotagem de Aeronave'
});

describe('janela Repartir entre beneficiários', () => {
  it('abre com o beneficiário de hoje e todas as unidades, e o botão travado', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <RepartirEntreBeneficiariosModal entrega={entrega} onClose={() => {}} />
      </QueryClientProvider>
    );
    expect(html).toContain('Repartir entre beneficiários');
    expect(html).toContain('21× Curso / Aperfeiçoamento - Pilotagem de Aeronave · Contrato 00331/2026');
    expect(html).toContain('Diretoria da Força Nacional de Segurança Pública');
    expect(html).toContain('value="21"');
    expect(html).toContain('Soma 21 de 21');
    expect(html).toContain('Aguardando informações');
    expect(html).toMatch(/data-testid="fisc-repartir-salvar"[^>]*disabled|disabled[^>]*data-testid="fisc-repartir-salvar"/);
  });
});
