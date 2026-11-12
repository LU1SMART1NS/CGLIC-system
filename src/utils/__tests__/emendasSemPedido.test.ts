import { describe, it, expect } from 'vitest';
import {
  autorPeloCodigo,
  contaEmendasSemPedido,
  emendasNaLista,
  lerNumeroDaEmenda,
  numeroDaEmenda,
  orgaoDoBeneficiario,
  orgaosNaOrdem,
  reservasParaLigar
} from '../emendasSemPedido';
import type { ContatoDaEmenda, EmendaSiop, PedidoEmenda } from '../../services/emendasService';

const HOJE = '2026-10-26';
const emenda = (extra: Partial<EmendaSiop>): EmendaSiop => ({
  id: 'e' + Math.random(), ano: 2026, numero: '42680021', autorId: 'S:1', valor: 1_000_000, gnd: 'GND-4', beneficiarioId: null, objeto: null,
  vistaEm: HOJE, observacao: null, versao: 1, criadoPorNome: null, ...extra
});
const pedido = (extra: Partial<PedidoEmenda>): PedidoEmenda => ({
  id: 'p' + Math.random(), numero: 1, autorId: 'S:1', etapa: 'RESERVADO', origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-10-20',
  minutaEm: null, minutaDocumentoSei: null, oficioNumero: null, oficioDocumentoSei: null, oficioProcessoSei: null, oficioEm: null, divergencia: null, devolvidoEm: null, siopEmenda: null, siopEmendaAno: null,
  siopValor: null, siopGnd: null, conferidoEm: null, solicitadoEm: null, solicitadoDocumentoSei: null, autorizadoEm: null, autorizadoDocumentoSei: null, cgofiEm: null, cgofiDocumentoSei: null,
  empenhadoEm: null, empenhadoDocumentosSei: [], contratacaoEm: null, contratacaoDocumentosSei: [], canceladoEm: null,
  canceladoMotivo: null, versao: 1, atualizadoPorNome: null, atualizadoEm: null, linhas: [], devolucoes: [], documentos: [], pedidoOrigemId: null, pedidoOrigemNome: null, anulacoes: [], emendaId: null, outrasEmendas: [], ...extra
});
const contato = (emendaId: string, contatoEm: string): ContatoDaEmenda => ({
  id: 'c' + Math.random(), emendaId, contatoEm, comQuem: 'Assessoria', meio: 'WHATSAPP', resumo: 'combinado', criadoPorNome: null, criadoEm: `${contatoEm}T12:00:00Z`
});

describe('Emendas sem pedido', () => {
  it('emenda registrada hoje, sem contato: avisa, ainda não urgente', () => {
    const e = emenda({});
    const [l] = emendasNaLista([e], [], [], HOJE);
    expect(l.situacao).toBe('SEM_CONTATO');
    expect(l.diasSemPedido).toBe(0);
    expect(l.urgente).toBe(false);
  });

  it('fica urgente com 7 dias sem contato, contando do último contato', () => {
    const velha = emenda({ id: 'velha', vistaEm: '2026-10-19' });
    const conversada = emenda({ id: 'conversada', numero: '42680022', vistaEm: '2026-10-01' });
    const lista = emendasNaLista([velha, conversada], [], [contato('conversada', '2026-10-22')], HOJE);
    const porId = new Map(lista.map((l) => [l.chave, l]));
    expect(porId.get('velha')!.urgente).toBe(true);
    expect(porId.get('velha')!.diasSemContato).toBe(7);
    expect(porId.get('conversada')!.situacao).toBe('EM_CONVERSA');
    expect(porId.get('conversada')!.diasSemContato).toBe(4);
    expect(porId.get('conversada')!.diasSemPedido).toBe(25);
    expect(porId.get('conversada')!.urgente).toBe(false);
    // Urgente primeiro.
    expect(lista[0].chave).toBe('velha');
  });

  it('pedido ligado pela emenda ou pelo nº conferido tira a emenda de "sem pedido"; cancelado não conta', () => {
    const a = emenda({ id: 'a' });
    const b = emenda({ id: 'b', numero: '42680022' });
    const c = emenda({ id: 'c', numero: '42680023' });
    const lista = emendasNaLista(
      [a, b, c],
      [
        pedido({ emendaId: 'a' }),
        pedido({ siopEmenda: '42680022', siopEmendaAno: 2026 }),
        pedido({ emendaId: 'c', etapa: 'CANCELADO' })
      ],
      [],
      HOJE
    );
    const porId = new Map(lista.map((l) => [l.chave, l]));
    expect(porId.get('a')!.situacao).toBe('COM_PEDIDO');
    expect(porId.get('b')!.situacao).toBe('COM_PEDIDO');
    expect(porId.get('c')!.situacao).toBe('SEM_CONTATO');
    expect(contaEmendasSemPedido(lista)).toEqual({ total: 1, urgentes: 0, valor: 1_000_000 });
  });

  it('nº de outro ano não liga; número só nos pedidos vira uma linha por ano + nº', () => {
    const e = emenda({ id: 'e', ano: 2026 });
    const lista = emendasNaLista(
      [e],
      [
        pedido({ numero: 5, siopEmenda: '42680021', siopEmendaAno: 2025, siopValor: 300 }),
        pedido({ numero: 8, siopEmenda: '44050002', siopEmendaAno: 2026, siopValor: 900_000, siopGnd: 'GND-4' }),
        pedido({ numero: 9, siopEmenda: '44050002', siopEmendaAno: null, reservadoEm: '2026-03-01' })
      ],
      [],
      HOJE
    );
    expect(lista.find((l) => l.chave === 'e')!.situacao).toBe('SEM_CONTATO');
    const kiko = lista.find((l) => l.chave === 'pedido:2026:44050002')!;
    expect(kiko.pedidos.map((p) => p.numero)).toEqual([9, 8]);
    expect(kiko.valor).toBe(900_000);
    expect(lista.find((l) => l.chave === 'pedido:2025:42680021')!.valor).toBe(300);
    // Nº que só aparece sem o ano fica em "sem ano" (28/10/2026), e não no ano da reserva.
    const sozinho = emendasNaLista([], [pedido({ numero: 10, siopEmenda: '43950006', siopEmendaAno: null, reservadoEm: '2026-03-01' })], [], HOJE);
    expect(sozinho.map((l) => [l.chave, l.ano])).toEqual([['pedido:sem:43950006', null]]);
  });

  it('lê o nº como no SIOP', () => {
    expect(lerNumeroDaEmenda('2026 4268 0021', null)).toEqual({ numero: '42680021', ano: 2026 });
    expect(lerNumeroDaEmenda('4268.0021', 2025)).toEqual({ numero: '42680021', ano: 2025 });
    expect(lerNumeroDaEmenda('4268 0021', null)).toBeNull();
    expect(lerNumeroDaEmenda('123', 2026)).toBeNull();
    expect(numeroDaEmenda('42680021')).toBe('4268 0021');
  });

  it('parlamentar pelo código do autor, menos o código que aparece com dois autores', () => {
    const m = autorPeloCodigo(
      [emenda({ numero: '42680021', autorId: 'S:1' })],
      [pedido({ siopEmenda: '42680018', autorId: 'S:1' }), pedido({ siopEmenda: '44050002', autorId: 'C:2' }), pedido({ siopEmenda: '44050009', autorId: 'C:3' })]
    );
    expect(m.get('4268')).toBe('S:1');
    expect(m.has('4405')).toBe(false);
  });

  it('ASPAR do órgão do beneficiário primeiro', () => {
    expect(orgaoDoBeneficiario({ nome: 'Corpo de Bombeiros Militar do Estado do Ceará', sigla: 'CBMCE', razaoSocial: null })).toBe('BM');
    expect(orgaoDoBeneficiario({ nome: 'Polícia Militar do Distrito Federal', sigla: 'PMDF', razaoSocial: null })).toBe('PM');
    expect(orgaoDoBeneficiario({ nome: 'Guarda Municipal de Recife', sigla: null, razaoSocial: 'Município do Recife' })).toBeNull();
    expect(orgaosNaOrdem('PC')).toEqual(['PC', 'PM', 'BM', 'PCI', 'SSP']);
  });

  it('sugere a reserva do mesmo parlamentar sem nº da emenda; some depois de ligada', () => {
    const e = emenda({ id: 'e1' });
    const reserva = pedido({ id: 'r1' });
    const outros = [
      pedido({ id: 'outro-autor', autorId: 'S:2' }),
      pedido({ id: 'com-numero', siopEmenda: '42680099', siopEmendaAno: 2026 }),
      pedido({ id: 'de-outra-emenda', emendaId: 'e9' }),
      pedido({ id: 'cancelada', etapa: 'CANCELADO' })
    ];
    const [l] = emendasNaLista([e], [reserva, ...outros], [], HOJE).filter((x) => x.chave === 'e1');
    expect(reservasParaLigar(l, [reserva, ...outros]).map((p) => p.id)).toEqual(['r1']);

    const ligada = { ...reserva, emendaId: 'e1' };
    const [depois] = emendasNaLista([e], [ligada], [], HOJE);
    expect(depois.situacao).toBe('COM_PEDIDO');
    expect(reservasParaLigar(depois, [ligada])).toEqual([]);
  });
});
