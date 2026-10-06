import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmpenhosBatchSyncPanel } from '../EmpenhosBatchSyncPanel';
import type { BatchSyncSummary } from '../../../hooks/useBatchSyncContractEmpenhos';

const props = {
  isSyncingAll: false,
  batchProgress: null,
  isAuthorizedToSync: true,
  onCancel: vi.fn(),
  onRetryFailed: vi.fn(),
  onClose: vi.fn(),
  onOpenContract: vi.fn()
};

const resumo = (over: Partial<BatchSyncSummary> = {}): BatchSyncSummary => ({
  totalContratos: 409,
  atualizados: 340,
  semEmpenhos: 64,
  parciais: 1,
  comErro: 4,
  empenhosPersistidos: 1180,
  novasTentativas: 6,
  cancelado: false,
  falhas: [],
  ...over
});

describe('EmpenhosBatchSyncPanel', () => {
  it('mostra o andamento e, na nova tentativa, diz que é a segunda passada', () => {
    const html = renderToStaticMarkup(
      <EmpenhosBatchSyncPanel {...props} batchSummary={null} isSyncingAll batchProgress={{ current: 2, total: 6, percent: 33, novaTentativa: true }} />
    );
    expect(html).toContain('Nova tentativa dos que não responderam');
    expect(html).toContain('2/6');
  });

  it('separa atualizados, sem empenho na fonte, parciais e com falha', () => {
    const html = renderToStaticMarkup(<EmpenhosBatchSyncPanel {...props} batchSummary={resumo()} />);
    expect(html).toContain('concluída de 409');
    expect(html).toContain('340 atualizado(s)');
    expect(html).toContain('64 sem empenho na fonte');
    expect(html).toContain('1 parcial(is)');
    expect(html).toContain('4 com falha');
    expect(html).toContain('6 contrato(s) tiveram nova tentativa');
  });

  it('lista os contratos com falha e oferece tentar de novo só esses', () => {
    const falhas = Array.from({ length: 10 }, (_, i) => ({
      contractKey: `200331-000${10 + i}-2017`,
      numero: `000${10 + i}/2017`,
      uasg: i === 0 ? '200330' : '200331',
      situacao: (i === 1 ? 'PARCIAL' : 'ERRO') as 'PARCIAL' | 'ERRO',
      erro: i === 0 ? 'Contratos.gov.br não respondeu em 30 s.' : 'Contratos.gov.br respondeu 503 ao listar os empenhos do contrato (id 1).'
    }));
    const html = renderToStaticMarkup(<EmpenhosBatchSyncPanel {...props} batchSummary={resumo({ falhas })} />);
    expect(html).toContain('Tentar de novo os 10 que falharam');
    expect(html).toContain('00010/2017 (UASG 200330)');
    expect(html).toContain('Contratos.gov.br não respondeu em 30 s.');
    expect(html).toContain(' parcial: ');
    expect(html).toContain('e mais 2 contrato(s).');
  });

  it('sem falhas não mostra o botão de tentar de novo', () => {
    const html = renderToStaticMarkup(<EmpenhosBatchSyncPanel {...props} batchSummary={resumo({ parciais: 0, comErro: 0 })} />);
    expect(html).not.toContain('Tentar de novo');
    expect(html).not.toContain('com falha');
  });
});
