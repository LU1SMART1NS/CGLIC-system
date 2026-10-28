import { describe, it, expect } from 'vitest';
import { andamentoDoPedido } from '../emendasAndamento';
import type { ItemCaep, LinhaPedido, NotaDaLinha, PedidoEmenda } from '../../services/emendasService';

const HOJE = '2026-10-27';
const A = '00031/2025-200331';
const itens = new Map<string, ItemCaep>([
  [`${A}-00001`, { itemKey: `${A}-00001`, numeroAta: '00031/2025', codigoUasg: '200331', numeroItem: '00001', descricao: 'Carabina', codigoPdm: 1, valorUnitario: 100, vigenciaFinal: '2027-06-25', ataEncerrada: false, alocado: 100 }]
]);
const linha = (id: string, extra: Partial<LinhaPedido> = {}): LinhaPedido => ({
  id, ordem: 1, tipo: 'ITEM', itemKey: `${A}-00001`, kitId: null, kitNome: null, kitVersao: null, kitComposicao: null,
  quantidade: 2, beneficiarioId: 'b1', cancelada: false, canceladaMotivo: null, empenhoDocumentoSei: null, contratoNumero: null, despachoDocumentoSei: null, ...extra
});
const pedido = (extra: Partial<PedidoEmenda>): PedidoEmenda => ({
  id: 'p', numero: 1, autorId: 'A1', etapa: 'RESERVADO', origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-09-02',
  minutaEm: null, minutaDocumentoSei: null, oficioNumero: null, oficioDocumentoSei: null, oficioProcessoSei: null, oficioEm: null, divergencia: null, devolvidoEm: null, siopEmenda: null, siopEmendaAno: null,
  siopValor: null, siopGnd: null, conferidoEm: null, solicitadoEm: null, solicitadoDocumentoSei: null, autorizadoEm: null, autorizadoDocumentoSei: null, cgofiEm: null, cgofiDocumentoSei: null,
  empenhadoEm: null, empenhadoDocumentosSei: [], contratacaoEm: null, contratacaoDocumentosSei: [], canceladoEm: null,
  canceladoMotivo: null, versao: 1, atualizadoPorNome: null, atualizadoEm: null, linhas: [linha('l1')], devolucoes: [], documentos: [], pedidoOrigemId: null, pedidoOrigemNome: null, anulacoes: [], emendaId: null, outrasEmendas: [], ...extra
});
const nota = (linhaId: string, extra: Partial<NotaDaLinha>): NotaDaLinha => ({
  linhaId, nota: '2026NE000103', regra: 'SEI', motivo: null, contractKey: null, empenhoId: 'e1', valorEmpenhado: 200, valorLiquidado: 0, valorPago: 0,
  entregaPrevista: null, entregaPrevistaValor: null, emitidaEm: '2026-04-17', atualizadoEm: null, ...extra
});
const estado = (p: PedidoEmenda, chave: string, notas = new Map<string, NotaDaLinha>()) =>
  andamentoDoPedido(p, itens, notas, HOJE, true).fases.flatMap((f) => f.tarefas).find((t) => t.chave === chave)!;

describe('Andamento do pedido: as etapas como tarefas', () => {
  it('quatro fases na ordem do caminho, com doze tarefas', () => {
    const a = andamentoDoPedido(pedido({}), itens, new Map(), HOJE, true);
    expect(a.fases.map((f) => f.nome)).toEqual(['Interlocução', 'Empenho', 'Contratação', 'Execução']);
    expect(a.fases.flatMap((f) => f.tarefas)).toHaveLength(12);
  });

  it('reservado: a minuta é com a CAEP, com o botão da próxima etapa; o resto vem depois', () => {
    const t = estado(pedido({}), 'minuta');
    expect(t.estado).toBe('COMIGO');
    expect(t.acao).toBe('ORIENTAR');
    expect(t.proxima).toBe('Registrar a minuta');
    expect(estado(pedido({}), 'conferir').estado).toBe('DEPOIS');
  });

  it('minuta enviada há mais de 30 dias sem ofício: cobrar resposta, com o prazo vencido', () => {
    const t = estado(pedido({ etapa: 'MINUTA', minutaEm: '2026-09-10' }), 'minuta');
    expect(t.estado).toBe('COBRAR');
    expect(t.prazo).toBe('10/10/2026');
    expect(t.vencido).toBe(true);
    const dentro = estado(pedido({ etapa: 'MINUTA', minutaEm: '2026-10-20' }), 'minuta');
    expect(dentro.estado).toBe('AGUARDANDO');
  });

  it('solicitado: a assinatura da Diretora do FNSP aguarda resposta', () => {
    const t = estado(pedido({ etapa: 'SOLICITADO', solicitadoEm: '2026-10-01' }), 'assinatura');
    expect(t.acao).toBe('ASSINAR');
    expect(t.estado).toBe('AGUARDANDO');
    expect(t.proxima).toBe('Registrar a autorização');
  });

  it('passos registrados pela fonte (migration 230): o envio à CGOFI fica comprovado pela nota, e o envio à CCGA pelo contrato', () => {
    const empenhado = pedido({ etapa: 'EMPENHADO', autorizadoEm: '2026-04-01', empenhadoEm: '2026-04-09', empenhadoPelaFonte: true });
    expect(estado(empenhado, 'cgofi')).toMatchObject({ estado: 'FEITA', feito: 'comprovado pela nota' });
    expect(estado(empenhado, 'empenho', new Map([['l1', nota('l1', {})]])).feito).toBe('09/04/2026 · pela nota no Tesouro · 1 nota');
    // Envio registrado pela CAEP: a data, sem "comprovado".
    expect(estado({ ...empenhado, cgofiEm: '2026-04-03', cgofiDocumentoSei: '12345678' }, 'cgofi').feito).toBe('03/04/2026');
    const contratado = pedido({ etapa: 'CONTRATACAO', empenhadoEm: '2026-06-16', empenhadoPelaFonte: true, contratacaoPelaFonte: true });
    const notas = new Map([['l1', nota('l1', { contractKey: '200331-00045-2026', contratoAssinadoEm: '2026-07-20' })]]);
    expect(estado(contratado, 'despacho', notas)).toMatchObject({ estado: 'FEITA', feito: 'comprovado pelo contrato' });
    expect(estado(contratado, 'contrato', notas)).toMatchObject({ estado: 'FEITA', feito: 'assinado em 20/07/2026 · 1 contrato', progresso: '1 de 1 item com contrato' });
  });

  it('na CCGA sem contrato: o contrato fecha sozinho; entrega, liquidação e pagamento ainda não', () => {
    const notas = new Map([['l1', nota('l1', {})]]);
    const p = pedido({ etapa: 'CONTRATACAO', contratacaoEm: '2026-10-15', empenhadoEm: '2026-04-17' });
    expect(estado(p, 'contrato', notas).estado).toBe('FONTE');
    expect(estado(p, 'contrato', notas).progresso).toBe('0 de 1 item com contrato');
    expect(estado(p, 'entrega', notas).estado).toBe('DEPOIS');
    expect(estado(p, 'liquidacao', notas).estado).toBe('FONTE');
    expect(estado(p, 'pagamento', notas).estado).toBe('FONTE');
  });

  it('contratado e pago: o pedido termina no pagamento; a entrega fica sem fonte', () => {
    const notas = new Map([['l1', nota('l1', { contractKey: '200331-00163-2026', valorLiquidado: 200, valorPago: 200 })]]);
    const p = pedido({ etapa: 'CONTRATACAO', contratacaoEm: '2026-10-15', empenhadoEm: '2026-04-17' });
    expect(estado(p, 'contrato', notas).estado).toBe('FEITA');
    expect(estado(p, 'entrega', notas).estado).toBe('SEM_FONTE');
    expect(estado(p, 'liquidacao', notas).estado).toBe('FEITA');
    expect(estado(p, 'pagamento', notas).estado).toBe('FEITA');
    const a = andamentoDoPedido(p, itens, notas, HOJE, true);
    // A entrega sem fonte não entra em contador nem conta como feita.
    expect(a.contagem).toEqual({ COMIGO: 0, COBRAR: 0, AGUARDANDO: 0, FONTE: 0 });
    expect(a.feitas).toBe(11);
    expect(a.total).toBe(12);
  });

  it('cancelado: feito o que aconteceu, o resto não houve e nada entra nos contadores', () => {
    const p = pedido({ etapa: 'CANCELADO', canceladoEm: '2026-10-01', canceladoMotivo: 'desistiu', minutaEm: '2026-09-05' });
    const a = andamentoDoPedido(p, itens, new Map(), HOJE, true);
    expect(estado(p, 'reservar').estado).toBe('FEITA');
    expect(estado(p, 'conferir').estado).toBe('NAO_HOUVE');
    expect(a.contagem).toEqual({ COMIGO: 0, COBRAR: 0, AGUARDANDO: 0, FONTE: 0 });
  });

  it('sem parlamentar: indicar é com a CAEP e a minuta espera', () => {
    const p = pedido({ autorId: null });
    expect(estado(p, 'reservar').estado).toBe('COMIGO');
    expect(estado(p, 'minuta').estado).toBe('DEPOIS');
    expect(estado(p, 'minuta').proxima).toBeNull();
  });

  it('a consulta vê as mesmas tarefas, sem botão', () => {
    const t = andamentoDoPedido(pedido({}), itens, new Map(), HOJE, false).fases[0].tarefas.find((x) => x.chave === 'minuta')!;
    expect(t.estado).toBe('COMIGO');
    expect(t.proxima).toBeNull();
  });
});
