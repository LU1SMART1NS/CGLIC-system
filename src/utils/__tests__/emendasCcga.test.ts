import { describe, it, expect } from 'vitest';
import { atasParaDesfazer, atasParaEnviar, enviosParaContratar, linhasDevolvidas, temSituacaoNaCcga, textoDoMovimento, voltaDaEtapa } from '../emendasCcga';
import { avisosDoPedido, situacaoDaLinha } from '../emendasPedidos';
import type { EmendaAContratar, LinhaPedido, NotaDaLinha, PedidoEmenda } from '../../services/emendasService';

const linha = (id: string, itemKey: string, extra: Partial<LinhaPedido> = {}): LinhaPedido => ({
  id, ordem: 1, tipo: 'ITEM', itemKey, kitId: null, kitNome: null, kitVersao: null, kitComposicao: null,
  quantidade: 2, beneficiarioId: 'b', cancelada: false, canceladaMotivo: null,
  empenhoDocumentoSei: null, contratoNumero: null, despachoDocumentoSei: null, ccgaSituacao: null, ...extra
});
const pedido = (extra: Partial<PedidoEmenda>): PedidoEmenda => ({
  id: 'p1', numero: 1, autorId: 'C:1', etapa: 'EMPENHADO', origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-09-01',
  minutaEm: '2026-09-02', minutaDocumentoSei: null, oficioNumero: null, oficioDocumentoSei: '41000001', oficioProcessoSei: null, oficioEm: '2026-09-05', divergencia: null, devolvidoEm: null,
  siopEmenda: null, siopEmendaAno: null, siopValor: null, siopGnd: null, conferidoEm: '2026-09-06', solicitadoEm: '2026-09-07', solicitadoDocumentoSei: '41000002',
  autorizadoEm: '2026-09-08', autorizadoDocumentoSei: '41000002', cgofiEm: '2026-09-09', cgofiDocumentoSei: '41000003',
  empenhadoEm: '2026-10-01', empenhadoDocumentosSei: [], contratacaoEm: null, contratacaoDocumentosSei: [], canceladoEm: null,
  canceladoMotivo: null, versao: 1, atualizadoPorNome: null, atualizadoEm: null, linhas: [], devolucoes: [], documentos: [], pedidoOrigemId: null, pedidoOrigemNome: null, anulacoes: [], emendaId: null, outrasEmendas: [], ...extra
});
const nota = (linhaId: string, contractKey: string | null = null): NotaDaLinha => ({
  linhaId, nota: '2026NE000412', regra: 'CONTRATO', motivo: null, contractKey, empenhoId: 'e', valorEmpenhado: 10, valorLiquidado: 0, valorPago: 0,
  entregaPrevista: null, entregaPrevistaValor: null, emitidaEm: '2026-10-01', atualizadoEm: null
});

// Pedido com 3 atas: a 45 com um item na CCGA e um contratado, a 102 devolvida, a 68 ainda não enviada.
const linhas = [
  linha('l1', '00045/2025-200331-00001', { ccgaSituacao: 'ENVIADA', ccgaEm: '2026-10-29', despachoDocumentoSei: '41234567' }),
  linha('l2', '00045/2025-200331-00002', { ccgaSituacao: 'ENVIADA', ccgaEm: '2026-10-29' }),
  linha('l3', '00102/2024-200331-00001', { ccgaSituacao: 'DEVOLVIDA', ccgaEm: '2026-10-30', ccgaMotivo: 'Item sem saldo na ata', ccgaExplicacao: 'acabou o saldo' }),
  linha('l4', '00068/2025-200330-00001'),
  linha('l5', '00068/2025-200330-00002', { cancelada: true })
];
const notas = new Map([nota('l1'), nota('l2', '200331-CTR-31'), nota('l3'), nota('l4')].map((n) => [n.linhaId, n]));
// Solicitação assinada e enviada à CGOFI de cada ata: a situação da linha segue para a nota e a CCGA.
const documentos = ['00045/2025-200331', '00102/2024-200331', '00068/2025-200330'].map((ataKey, i) => ({
  id: `d${i}`, etapa: 'AUTORIZACAO' as const, numero: `4100010${i}`, data: '2026-09-07', ataKey, assinadaEm: '2026-09-08', linhas: [],
  enviosCgofi: [{ numero: '41000003', data: '2026-09-09' }], solicitacoes: []
}));
const naCcga = pedido({ etapa: 'CONTRATACAO', contratacaoEm: '2026-10-29', linhas, documentos });

describe('envio à CCGA por ata (migration 248)', () => {
  it('sem a coluna no banco, o pedido segue a etapa e nada é por ata', () => {
    const antigo = pedido({ etapa: 'CONTRATACAO', linhas: [linha('x', '00045/2025-200331-00001', { ccgaSituacao: undefined })] });
    expect(temSituacaoNaCcga(antigo)).toBe(false);
    expect(atasParaEnviar(antigo, new Map())).toEqual([]);
    expect(situacaoDaLinha(antigo, antigo.linhas[0], new Map()).situacao).not.toBe('EMPENHADO');
  });

  it('a enviar: atas com itens fora da CCGA e sem contrato, inclusive os devolvidos', () => {
    expect(atasParaEnviar(naCcga, notas).map((a) => [a.numeroAta, a.linhas.map((l) => l.id)])).toEqual([
      ['00068/2025', ['l4']],
      ['00102/2024', ['l3']]
    ]);
    expect(atasParaEnviar(pedido({ etapa: 'CGOFI', linhas }), notas)).toEqual([]);
  });

  it('a desfazer: atas com itens na CCGA ou devolvidos, sem o contratado', () => {
    expect(atasParaDesfazer(naCcga, notas).map((a) => [a.numeroAta, a.linhas.map((l) => l.id)])).toEqual([
      ['00045/2025', ['l1']],
      ['00102/2024', ['l3']]
    ]);
    expect(atasParaDesfazer(pedido({ linhas }), notas)).toEqual([]);
  });

  it('devolvidos viram aviso para a CAEP e a linha mostra o motivo', () => {
    expect(linhasDevolvidas(naCcga, notas).map((l) => l.id)).toEqual(['l3']);
    const aviso = avisosDoPedido(naCcga, new Map(), '2026-10-30', notas).find((a) => a.tipo === 'devolvidoCcga');
    expect(aviso?.texto).toContain('Item sem saldo na ata (acabou o saldo)');
    expect(aviso?.linhaId).toBe('l3');
    expect(situacaoDaLinha(naCcga, linhas[2], notas)).toMatchObject({ rotulo: 'Devolvido pela CCGA', pendente: true });
    expect(situacaoDaLinha(naCcga, linhas[3], notas).detalhe).toContain('aguarda o envio à CCGA');
    expect(situacaoDaLinha(naCcga, linhas[0], notas).situacao).toBe('NA_CCGA');
    expect(situacaoDaLinha(naCcga, linhas[1], notas).situacao).toBe('CONTRATADO');
  });

  it('voltar etapa: um passo por vez até a CGOFI; nota emitida e contratação não voltam', () => {
    expect(voltaDaEtapa(pedido({ etapa: 'CGOFI' }))).toMatchObject({ para: 'AUTORIZADO' });
    expect(voltaDaEtapa(pedido({ etapa: 'AUTORIZADO' }))).toMatchObject({ para: 'SOLICITADO' });
    expect(voltaDaEtapa(pedido({ etapa: 'SOLICITADO' }))).toMatchObject({ para: 'CONFERIDO' });
    expect(voltaDaEtapa(pedido({ etapa: 'CONFERIDO' }))).toMatchObject({ para: 'OFICIO' });
    expect(voltaDaEtapa(pedido({ etapa: 'OFICIO' }))).toMatchObject({ para: 'MINUTA' });
    expect(voltaDaEtapa(pedido({ etapa: 'OFICIO', minutaEm: null }))).toMatchObject({ para: 'RESERVADO' });
    expect(voltaDaEtapa(pedido({ etapa: 'MINUTA' }))).toMatchObject({ para: 'RESERVADO' });
    expect(voltaDaEtapa(pedido({ etapa: 'EMPENHADO' }))).toBeNull();
    expect(voltaDaEtapa(pedido({ etapa: 'CONTRATACAO' }))).toBeNull();
    expect(voltaDaEtapa(pedido({ etapa: 'RESERVADO' }))).toBeNull();
  });

  it('histórico em frases', () => {
    const m = { id: 'm', ataKey: '00045/2025-200331', linhaIds: ['l1', 'l2'], etapaDe: null, etapaPara: null, documentoSei: null, explicacao: 'acabou', data: '2026-10-30', criadoPorNome: null, criadoEm: '' };
    expect(textoDoMovimento({ ...m, acao: 'DEVOLUCAO_CCGA', motivo: 'Outro' }, 2)).toEqual({ titulo: 'Devolvido à CAEP · ata 00045/2025 · 2 itens', detalhe: 'Outro: acabou' });
    expect(textoDoMovimento({ ...m, acao: 'VOLTOU_ETAPA', etapaDe: 'CGOFI', etapaPara: 'AUTORIZADO', motivo: 'engano' }, 0).detalhe).toBe('engano');
    expect(textoDoMovimento({ ...m, acao: 'RETIFICADOR', motivo: 'Substitui o ofício SEI 37091178 (R$ 1200,00)', explicacao: 'Mira → PMX: 3 → 2' }, 0)).toEqual({
      titulo: 'Ofício retificador registrado',
      detalhe: 'Substitui o ofício SEI 37091178 (R$ 1200,00) · Mira → PMX: 3 → 2'
    });
  });
});

describe('Início do gestor da ata: emendas a contratar', () => {
  const r = (extra: Partial<EmendaAContratar>): EmendaAContratar => ({
    tipo: 'A_CONTRATAR', pedidoId: 'p1', pedidoNome: 'Pedido 3/2026', autorNome: 'Dep. A', autorUf: 'MG', ataKey: '00045/2025-200331', gestorUserId: 'g1', gestorNome: 'Gestor 45',
    linhaId: 'l1', itemKey: '00045/2025-200331-00001', quantidade: 2, nota: '2026NE000412', documentoSei: '41234567', data: '2026-10-29', motivo: null, porNome: null, ...extra
  });
  const linhasRpc = [
    r({}),
    r({ linhaId: 'l2', data: '2026-10-20', documentoSei: '41234500' }),
    r({ pedidoId: 'p2', pedidoNome: 'Pedido 1/2026', ataKey: '00068/2025-200330', gestorUserId: null, gestorNome: null }),
    r({ tipo: 'DESFEITO', linhaId: null, ataKey: '00102/2024-200331', motivo: 'engano', data: '2026-10-30' })
  ];

  it('gestor: um grupo por pedido e ata, do envio mais antigo, com os despachos', () => {
    const { aContratar, desfeitos } = enviosParaContratar(linhasRpc, { coordenador: false });
    expect(aContratar.map((g) => [g.pedidoNome, g.ataKey, g.linhas.length, g.enviadoEm, g.documentosSei])).toEqual([
      ['Pedido 3/2026', '00045/2025-200331', 2, '2026-10-20', ['41234567', '41234500']],
      ['Pedido 1/2026', '00068/2025-200330', 1, '2026-10-29', ['41234567']]
    ]);
    expect(aContratar[0].autor).toBe('Dep. A (MG)');
    expect(desfeitos).toHaveLength(1);
  });

  it('coordenador: as atas sem gestor, ou as do gestor escolhido no painel', () => {
    expect(enviosParaContratar(linhasRpc, { coordenador: true }).aContratar.map((g) => g.pedidoNome)).toEqual(['Pedido 1/2026']);
    expect(enviosParaContratar(linhasRpc, { coordenador: true, gestorNome: 'Gestor 45' }).aContratar.map((g) => g.pedidoNome)).toEqual(['Pedido 3/2026']);
  });
});
