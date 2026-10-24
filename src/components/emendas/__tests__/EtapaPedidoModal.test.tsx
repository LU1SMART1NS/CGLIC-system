import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ItemCaep, LinhaPedido, PedidoEmenda } from '../../../services/emendasService';

vi.mock('../../../hooks/useEmendas', () => ({
  hojeEmBrasilia: () => '2026-10-24',
  useAutoresEmendas: () => ({ data: [] }),
  useAvancarPedido: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCancelarPedido: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useInformarSolicitacaoDaAta: () => ({ isPending: false, mutateAsync: vi.fn() })
}));
vi.mock('../../../hooks/useEmendasQuadro', () => ({ usePrecosParaEmenda: () => ({ precos: undefined }) }));
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
vi.mock('../QuadroGabinete', () => ({ QuadroGabinete: () => null }));

import { EtapaPedidoModal } from '../EtapaPedidoModal';

const A = '00031/2025-200331';
const B = '00048/2025-200331';
const item = (k: string, numeroAta: string, nomeCurto: string, fornecedor: string): ItemCaep => ({
  itemKey: k, numeroAta, codigoUasg: '200331', numeroItem: '00001', descricao: nomeCurto, codigoPdm: 1, valorUnitario: 100,
  vigenciaFinal: '2027-06-25', ataEncerrada: false, alocado: 100, nomeCurto, fornecedor
});
const itens = new Map([item(`${A}-00001`, '00031/2025', 'Carabina', 'FORNECEDOR A'), item(`${B}-00001`, '00048/2025', 'Mira', 'FORNECEDOR B')].map((i) => [i.itemKey, i]));
const linha = (id: string, itemKey: string, quantidade: number): LinhaPedido => ({
  id, ordem: 1, tipo: 'ITEM', itemKey, kitId: null, kitNome: null, kitVersao: null, kitComposicao: null, quantidade, beneficiarioId: null,
  cancelada: false, canceladaMotivo: null, empenhoDocumentoSei: null, contratoNumero: null, despachoDocumentoSei: null, aConferir: null, planilhaRef: null
});
const pedido = (etapa: PedidoEmenda['etapa'], documentos: PedidoEmenda['documentos'] = []): PedidoEmenda => ({
  id: 'p', numero: 1, autorId: 'A1', etapa, origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-09-01',
  minutaEm: null, minutaDocumentoSei: null, oficioNumero: null, oficioDocumentoSei: null, oficioProcessoSei: null, oficioEm: null, divergencia: null, devolvidoEm: null,
  siopEmenda: '28630004', siopValor: null, siopGnd: null, conferidoEm: null, solicitadoEm: null, solicitadoDocumentoSei: null, autorizadoEm: null, autorizadoDocumentoSei: null,
  cgofiEm: null, cgofiDocumentoSei: null, empenhadoEm: null, empenhadoDocumentosSei: [], contratacaoEm: null, contratacaoDocumentosSei: [], canceladoEm: null, canceladoMotivo: null,
  versao: 1, atualizadoPorNome: null, atualizadoEm: null, linhas: [linha('l1', `${A}-00001`, 8), linha('l2', `${B}-00001`, 3)], devolucoes: [], documentos
});

describe('janela das etapas: uma solicitação de empenho para cada ata (migration 178)', () => {
  it('registrar a solicitação de um pedido com várias atas pede um número para cada ata, com os itens', () => {
    const html = renderToStaticMarkup(<EtapaPedidoModal pedido={pedido('CONFERIDO')} acao="SOLICITADO" itens={itens} nomeDoAutor="Deputado" onClose={() => {}} />);
    expect(html).toContain('emendas-etapa-sei-por-ata');
    expect(html).toContain('emendas-etapa-sei-ata-00031/2025');
    expect(html).toContain('Ata 00048/2025 · FORNECEDOR B');
    expect(html).toContain('item 1 · Carabina · 8 un.');
    // Sem o campo único de antes.
    expect(html).not.toContain('data-testid="emendas-etapa-sei"');
  });

  it('informar a solicitação de uma ata: número, a ata escolhida e, depois da autorização, a data da assinatura', () => {
    const p = pedido('CGOFI', [{ etapa: 'AUTORIZACAO', numero: '37098929', data: null, ataKey: A, assinadaEm: '2026-09-24' }]);
    const html = renderToStaticMarkup(<EtapaPedidoModal pedido={p} acao="SOLICITACAO_ATA" contexto={{ ataKey: B }} itens={itens} nomeDoAutor="Deputado" onClose={() => {}} />);
    expect(html).toContain('Solicitação de empenho de uma ata');
    expect(html).toContain('emendas-etapa-sei-ata');
    expect(html).toMatch(/<option value="00048\/2025-200331" selected="">Ata 00048\/2025 · FORNECEDOR B \(falta\)<\/option>/);
    expect(html).toContain('Ata 00031/2025 · FORNECEDOR A (SEI 37098929)');
    expect(html).toContain('emendas-etapa-assinada-em');
  });

  it('antes da autorização não pede a data da assinatura', () => {
    const html = renderToStaticMarkup(<EtapaPedidoModal pedido={pedido('SOLICITADO')} acao="SOLICITACAO_ATA" itens={itens} nomeDoAutor="Deputado" onClose={() => {}} />);
    expect(html).not.toContain('emendas-etapa-assinada-em');
  });
});
