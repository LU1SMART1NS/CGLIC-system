import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AutorEmenda, NotaSemPedido, PedidoEmenda, PedidoProvavel } from '../../../services/emendasService';
import { notasSemPedidoPorEmenda } from '../../../utils/emendasConferenciaNota';

const pedido = (id: string, numero: number, autorId: string, siopEmenda: string, siopEmendaAno: number | null): PedidoEmenda => ({
  id, numero, numeroNoAno: 1, anoDoNumero: siopEmendaAno, autorId, etapa: 'CONTRATACAO', origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-05-01',
  minutaEm: null, minutaDocumentoSei: null, oficioNumero: null, oficioDocumentoSei: null, oficioProcessoSei: null, oficioEm: null, divergencia: null, devolvidoEm: null, siopEmenda, siopEmendaAno,
  siopValor: null, siopGnd: null, conferidoEm: null, solicitadoEm: null, solicitadoDocumentoSei: null, autorizadoEm: null, autorizadoDocumentoSei: null, cgofiEm: null, cgofiDocumentoSei: null,
  empenhadoEm: null, empenhadoDocumentosSei: [], contratacaoEm: null, contratacaoDocumentosSei: [], canceladoEm: null,
  canceladoMotivo: null, versao: 3, atualizadoPorNome: null, atualizadoEm: null, linhas: [], devolucoes: [], documentos: [], pedidoOrigemId: null, pedidoOrigemNome: null, anulacoes: [], emendaId: null, outrasEmendas: []
});
const autor = (id: string, nome: string): AutorEmenda => ({ id, nome, tipo: 'BANCADA', nomeCivil: null, partido: null, uf: 'CE', emExercicio: true, legislatura: 57, lidoEm: null });
const prov = (p: PedidoEmenda, valorSemNota: number, mesmoCodigo: boolean): PedidoProvavel => ({
  pedidoId: p.id, pedidoNumero: p.numero, autorId: p.autorId, pedidoEmenda: p.siopEmenda, pedidoEmendaAno: p.siopEmendaAno, valorItens: valorSemNota, valorSemNota, mesmoCodigo
});
const nota = (n: string, credor: string, valor: number, pedidosProvaveis: PedidoProvavel[]): NotaSemPedido => ({
  empenhoId: n, nota: n, ug: '200330', dataEmissao: '2026-05-19', valorEmpenhado: valor, credorNome: credor, planoInterno: 'SP999S97107 - 202471070011 - BANCADA DO CEARA',
  emenda: '71070011', emendaAno: 2024, autoresDoCodigo: ['Bancada CE'], pedidosDoCodigo: ['p520'], pedidosProvaveis
});

const P520 = pedido('p520', 520, 'CE', '71070008', 2026);
const P445 = pedido('p445', 445, 'SP', '71250002', 2024);
const NOTAS = [
  nota('2026NE000171', 'STELLANTIS', 1478500, [prov(P520, 1544468.3, true)]),
  nota('2026NE000180', 'KADOSHI', 116556.9, [prov(P520, 116556.9, true)]),
  nota('2026NE000183', 'RC-FOREVER', 503003.12, [prov(P445, 503003.12, false), prov(P520, 503003.12, true)])
];

vi.mock('../../../hooks/useEmendas', () => ({
  hojeEmBrasilia: () => '2026-10-26',
  usePedidosEmendas: () => ({ data: [P520, P445] }),
  useAutoresEmendas: () => ({ data: [autor('CE', 'Bancada CE'), autor('SP', 'Bancada SP')] }),
  useNotasSemPedido: () => ({ data: NOTAS }),
  useLigarEmendaAoPedido: () => ({ isPending: false, mutateAsync: vi.fn() })
}));
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

import { LigarEmendaModal } from '../LigarEmendaModal';

describe('Ligar emenda ao pedido (migration 211)', () => {
  it('pela gaveta: abre no pedido sugerido, compara nota por nota e pede a escolha', () => {
    const [emenda] = notasSemPedidoPorEmenda(NOTAS, new Set());
    const html = renderToStaticMarkup(<LigarEmendaModal emenda={emenda} onClose={() => {}} />);
    expect(html).toContain('Ligar a emenda 2024 · 7107 0011 a um pedido');
    expect(html).toContain('Com itens de mesmo fornecedor e valor');
    expect(html).toMatch(/<option value="p520" selected="">Pedido 1\/2026 · Bancada CE · emenda 2026 · 7107 0008 · 2 de 3 notas iguais/);
    expect(html).toContain('Pedido 1/2024 · Bancada SP');
    expect(html).toContain('Mesmo código de autor (7107)');
    expect(html).toContain('-4% · confira');
    expect(html).toContain('valor igual');
    expect(html).toContain('Outra emenda do pedido');
    expect(html).toContain('O nº do pedido está errado');
    // Sem escolha, nada vai ao banco.
    expect(html).not.toContain('emendas-ligar-emenda-efeito');
  });

  it('pelo pedido: o gestor digita a emenda; já vem como outra emenda do pedido', () => {
    const html = renderToStaticMarkup(<LigarEmendaModal pedido={P520} onClose={() => {}} />);
    expect(html).toContain('Adicionar emenda ao pedido 1/2026');
    expect(html).toContain('emendas-ligar-emenda-numero');
    expect(html).not.toContain('emendas-ligar-emenda-pedido');
  });
});
