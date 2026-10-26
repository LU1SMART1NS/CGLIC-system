import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ItemCaep, LinhaPedido, PedidoEmenda } from '../../../services/emendasService';

const naLista = vi.hoisted(() => ({ pedidos: [] as PedidoEmenda[] }));
vi.mock('../../../hooks/useEmendas', () => ({
  hojeEmBrasilia: () => '2026-10-24',
  useAutoresEmendas: () => ({ data: [] }),
  useAvancarPedido: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCancelarPedido: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useInformarSolicitacaoDaAta: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useRegistrarEnvioCgofi: () => ({ isPending: false, mutateAsync: vi.fn() }),
  usePedidosEmendas: () => ({ data: naLista.pedidos }),
  useEmendasSiop: () => ({ data: [] })
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
  cancelada: false, canceladaMotivo: null, empenhoDocumentoSei: null, contratoNumero: null, despachoDocumentoSei: null
});
const pedido = (etapa: PedidoEmenda['etapa'], documentos: PedidoEmenda['documentos'] = []): PedidoEmenda => ({
  id: 'p', numero: 1, autorId: 'A1', etapa, origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-09-01',
  minutaEm: null, minutaDocumentoSei: null, oficioNumero: null, oficioDocumentoSei: null, oficioProcessoSei: null, oficioEm: null, divergencia: null, devolvidoEm: null,
  siopEmenda: '28630004', siopEmendaAno: null, siopValor: null, siopGnd: null, conferidoEm: null, solicitadoEm: null, solicitadoDocumentoSei: null, autorizadoEm: null, autorizadoDocumentoSei: null,
  cgofiEm: null, cgofiDocumentoSei: null, empenhadoEm: null, empenhadoDocumentosSei: [], contratacaoEm: null, contratacaoDocumentosSei: [], canceladoEm: null, canceladoMotivo: null,
  versao: 1, atualizadoPorNome: null, atualizadoEm: null, linhas: [linha('l1', `${A}-00001`, 8), linha('l2', `${B}-00001`, 3)], devolucoes: [], documentos, pedidoOrigemId: null, pedidoOrigemNumero: null, anulacoes: [], emendaId: null
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
    const p = pedido('CGOFI', [{ id: '37098929', linhas: [], etapa: 'AUTORIZACAO', numero: '37098929', data: null, ataKey: A, assinadaEm: '2026-09-24' }]);
    const html = renderToStaticMarkup(<EtapaPedidoModal pedido={p} acao="SOLICITACAO_ATA" contexto={{ ataKey: B }} itens={itens} nomeDoAutor="Deputado" onClose={() => {}} />);
    expect(html).toContain('Solicitação de empenho de uma ata');
    expect(html).toContain('emendas-etapa-sei-ata');
    expect(html).toMatch(/<option value="00048\/2025-200331" selected="">Ata 00048\/2025 · FORNECEDOR B \(falta\)<\/option>/);
    expect(html).toContain('Ata 00031/2025 · FORNECEDOR A (SEI 37098929)');
    expect(html).toContain('emendas-etapa-assinada-em');
  });

  it('trocar uma solicitação trava a ata e explica que a anterior fica no pedido; sem troca, entra a mais', () => {
    const p = pedido('CONTRATACAO', [{ id: '35673658', linhas: [], etapa: 'AUTORIZACAO', numero: '35673658', data: null, ataKey: A, assinadaEm: '2026-05-27' }]);
    const troca = renderToStaticMarkup(<EtapaPedidoModal pedido={p} acao="SOLICITACAO_ATA" contexto={{ ataKey: A, numero: '35673658', troca: true }} itens={itens} nomeDoAutor="Deputado" onClose={() => {}} />);
    expect(troca).toContain('Um número diferente troca essa solicitação');
    expect(troca).toMatch(/data-testid="emendas-etapa-ata"[^>]*disabled|disabled[^>]*data-testid="emendas-etapa-ata"/);
    const mais = renderToStaticMarkup(<EtapaPedidoModal pedido={p} acao="SOLICITACAO_ATA" contexto={{ ataKey: A }} itens={itens} nomeDoAutor="Deputado" onClose={() => {}} />);
    expect(mais).toContain('Solicitação a mais desta ata (nova rodada): as que ela já tem (35673658) continuam.');
  });

  it('antes da autorização não pede a data da assinatura', () => {
    const html = renderToStaticMarkup(<EtapaPedidoModal pedido={pedido('SOLICITADO')} acao="SOLICITACAO_ATA" itens={itens} nomeDoAutor="Deputado" onClose={() => {}} />);
    expect(html).not.toContain('emendas-etapa-assinada-em');
  });
});

describe('janela das etapas: as linhas que a solicitação cobre (migration 180)', () => {
  it('lista as linhas da ata escolhida; a primeira solicitação da ata começa com todas marcadas', () => {
    const html = renderToStaticMarkup(<EtapaPedidoModal pedido={pedido('SOLICITADO')} acao="SOLICITACAO_ATA" contexto={{ ataKey: A }} itens={itens} nomeDoAutor="Deputado" onClose={() => {}} />);
    expect(html).toContain('emendas-etapa-linhas-cobertas');
    expect(html).toContain('8 × Carabina');
    expect(html).not.toContain('3 × Mira');
    expect(html).toMatch(/data-testid="emendas-etapa-linha-l1"[^>]*checked|checked[^>]*data-testid="emendas-etapa-linha-l1"/);
  });

  it('trocando uma solicitação, começam marcadas as linhas que ela cobre; a linha de outra solicitação diz qual', () => {
    const p = pedido('CONTRATACAO', [
      { id: 'd1', linhas: [{ linhaId: 'l1', quantidade: 8 }], etapa: 'AUTORIZACAO', numero: '35673658', data: null, ataKey: A, assinadaEm: '2026-05-27' },
      { id: 'd2', linhas: [], etapa: 'AUTORIZACAO', numero: '36536429', data: null, ataKey: A, assinadaEm: null }
    ]);
    const html = renderToStaticMarkup(<EtapaPedidoModal pedido={p} acao="SOLICITACAO_ATA" contexto={{ ataKey: A, numero: '36536429', troca: true }} itens={itens} nomeDoAutor="Deputado" onClose={() => {}} />);
    expect(html).toContain('hoje na solicitação 35673658');
  });

  it('conferência: o ano vem à parte, e o código de autor de outro parlamentar acende o aviso', () => {
    naLista.pedidos = [{ ...pedido('CONTRATACAO'), id: 'outro', autorId: 'B2', siopEmenda: '28630011' }];
    const html = renderToStaticMarkup(<EtapaPedidoModal pedido={pedido('OFICIO')} acao="CONFERIDO" itens={itens} nomeDoAutor="Deputado" onClose={() => {}} />);
    naLista.pedidos = [];
    expect(html).toContain('emendas-etapa-emenda-ano');
    expect(html).toMatch(/<option value="2026" selected/);
    expect(html).toContain('value="2863 0004"');
    expect(html).toContain('emendas-etapa-emenda-outro-autor');
    expect(html).not.toContain('emendas-etapa-emenda-outro-pedido');
  });

  it('conferência: a mesma emenda em outro pedido do mesmo parlamentar só informa', () => {
    naLista.pedidos = [
      { ...pedido('CONTRATACAO'), id: 'outro', siopEmenda: '28630004', oficioProcessoSei: '08027.000001/2026-01' },
      { ...pedido('CONTRATACAO'), id: 'outro2', siopEmenda: '28630004', oficioProcessoSei: '08027.000001/2026-01' }
    ];
    const html = renderToStaticMarkup(<EtapaPedidoModal pedido={pedido('OFICIO')} acao="CONFERIDO" itens={itens} nomeDoAutor="Deputado" onClose={() => {}} />);
    naLista.pedidos = [];
    expect(html).toContain('emendas-etapa-emenda-outro-pedido');
    expect(html).toContain('2 outros pedidos');
    expect(html).toContain('todos do Processo 08027.000001/2026-01');
    expect(html.split('Processo 08027.000001/2026-01').length - 1).toBe(1);
    expect(html).not.toContain('emendas-etapa-emenda-outro-autor');
  });

  it('envio à CGOFI: lista as solicitações assinadas sem envio, todas marcadas; as já enviadas ficam de fora', () => {
    const p = pedido('CONTRATACAO', [
      { id: 'd1', linhas: [{ linhaId: 'l1', quantidade: 8 }], etapa: 'AUTORIZACAO', numero: '35272441', data: null, ataKey: A, assinadaEm: '2026-04-17', enviosCgofi: [{ numero: '35294101', data: '2026-04-17' }] },
      { id: 'd2', linhas: [], etapa: 'AUTORIZACAO', numero: '37082291', data: null, ataKey: B, assinadaEm: '2026-09-23' },
      { id: 'd3', linhas: [], etapa: 'AUTORIZACAO', numero: '37082300', data: null, ataKey: A, assinadaEm: null }
    ]);
    const html = renderToStaticMarkup(<EtapaPedidoModal pedido={p} acao="CGOFI" itens={itens} nomeDoAutor="Deputado" onClose={() => {}} />);
    expect(html).toContain('emendas-etapa-envio-solicitacoes');
    expect(html).toMatch(/data-testid="emendas-etapa-envio-37082291"[^>]*checked|checked[^>]*data-testid="emendas-etapa-envio-37082291"/);
    expect(html).not.toContain('emendas-etapa-envio-35272441');
    // Sem ligação gravada, os itens vêm da solicitação única da ata.
    expect(html).toMatch(/Ata 00048\/2025[^]*Mira/);
    expect(html).not.toContain('emendas-etapa-envio-37082300');
  });
});
