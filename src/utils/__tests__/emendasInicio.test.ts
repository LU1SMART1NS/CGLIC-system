import { describe, it, expect } from 'vitest';
import { avisosDosPedidosParaOMenu, prazoDoAviso, resumoInicioEmendas, NOME_LONGO } from '../emendasInicio';
import type { ConferenciaEmpenho, ItemCaep, LinhaPedido, NotaDaLinha, PedidoEmenda } from '../../services/emendasService';

const HOJE = '2026-10-23';
const item = (k: string, extra: Partial<ItemCaep> = {}): ItemCaep => ({
  itemKey: k, numeroAta: '00031/2025', codigoUasg: '200331', numeroItem: '00001', descricao: k, codigoPdm: 1,
  valorUnitario: 100, vigenciaFinal: '2027-06-25', ataEncerrada: false, alocado: 100, ...extra
});
const linha = (extra: Partial<LinhaPedido>): LinhaPedido => ({
  id: 'l' + Math.random(), ordem: 1, tipo: 'ITEM', itemKey: 'longe', kitId: null, kitNome: null, kitVersao: null, kitComposicao: null,
  quantidade: 1, beneficiarioId: 'b1', cancelada: false, canceladaMotivo: null,
  empenhoDocumentoSei: null, contratoNumero: null, despachoDocumentoSei: null, ...extra
});
const pedido = (extra: Partial<PedidoEmenda>): PedidoEmenda => ({
  id: 'p' + Math.random(), numero: 1, autorId: 'C:1', etapa: 'RESERVADO', origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-10-20',
  minutaEm: null, minutaDocumentoSei: null, oficioNumero: null, oficioDocumentoSei: null, oficioProcessoSei: null, oficioEm: null, divergencia: null, devolvidoEm: null, siopEmenda: null, siopEmendaAno: null,
  siopValor: null, siopGnd: null, conferidoEm: null, solicitadoEm: null, solicitadoDocumentoSei: null, autorizadoEm: null, autorizadoDocumentoSei: null, cgofiEm: null, cgofiDocumentoSei: null,
  empenhadoEm: null, empenhadoDocumentosSei: [], contratacaoEm: null, contratacaoDocumentosSei: [], canceladoEm: null,
  canceladoMotivo: null, versao: 1, atualizadoPorNome: null, atualizadoEm: null, linhas: [], devolucoes: [], documentos: [], pedidoOrigemId: null, pedidoOrigemNome: null, anulacoes: [], emendaId: null, outrasEmendas: [], ...extra
});
const nota = (linhaId: string): NotaDaLinha => ({
  linhaId, nota: '2026NE000001', regra: 'CONTRATO', motivo: null, contractKey: null, empenhoId: 'e1',
  valorEmpenhado: 1, valorLiquidado: 0, valorPago: 0, entregaPrevista: null, entregaPrevistaValor: null, emitidaEm: null, atualizadoEm: null
});

const ITENS = [
  item('longe', { alocado: 100 }),
  item('perto', { numeroAta: '00051/2024', vigenciaFinal: '2027-01-10', alocado: 50 }),
  item('corte', { numeroAta: '00024/2024', vigenciaFinal: '2026-10-25', alocado: 30 }),
  item('fim', { numeroAta: '00020/2025', vigenciaFinal: '2026-05-28', ataEncerrada: true, alocado: 40 })
];

describe('Início do gestor de emendas', () => {
  const comNota = linha({ itemKey: 'longe' });
  const semNota = linha({ itemKey: 'longe' });
  const pedidos = [
    pedido({ id: 'vencendo', linhas: [linha({ itemKey: 'perto', quantidade: 10 })] }),
    pedido({ id: 'encerrada', linhas: [linha({ itemKey: 'fim', quantidade: 5 })] }),
    pedido({ id: 'corte', etapa: 'OFICIO', linhas: [linha({ itemKey: 'corte', quantidade: 30 })] }),
    pedido({ id: 'empenhado', etapa: 'EMPENHADO', linhas: [comNota, semNota, linha({ itemKey: 'longe' })] }),
    pedido({ id: 'tranquilo', linhas: [linha({ itemKey: 'longe', quantidade: 20 })] }),
    pedido({ id: 'cancelado', etapa: 'CANCELADO', linhas: [linha({ itemKey: 'longe', quantidade: 70 })] })
  ];
  const r = resumoInicioEmendas(pedidos, ITENS, new Map([[comNota.id, nota(comNota.id)]]), HOJE);

  it('conta os pedidos por aviso e os vermelhos, sem os cancelados', () => {
    expect(r.porTipo).toMatchObject({ ataVencida: 1, ataNoCorte: 1, ataVencendo: 1, semNota: 1, semOficio: 0, divergencia: 0 });
    expect(r.graves).toBe(2);
    expect(r.antesDoEmpenho).toBe(4);
    expect(r.porEtapa).toEqual({ RESERVADO: 3, OFICIO: 1, EMPENHADO: 1 });
    expect(r.empenhados).toBe(1);
    expect([r.linhasEmpenhadas, r.linhasComNota]).toEqual([3, 1]);
  });

  it('número do menu: os mesmos pedidos com aviso e os mesmos vermelhos das pendências do Início', () => {
    const notas = new Map([[comNota.id, nota(comNota.id)]]);
    expect(avisosDosPedidosParaOMenu(pedidos, ITENS, HOJE, notas)).toEqual({ comAviso: r.pedidosComAviso.length, urgentes: r.graves });
  });

  it('número do menu fica vermelho com empenhado a mais ainda não resolvido', () => {
    const empenhado = pedidos.find((p) => p.id === 'empenhado')!;
    const diferenca: ConferenciaEmpenho = {
      emenda: '202630840008', itemKey: 'longe', qtdPedido: 3, qtdNasNotas: 5, notas: ['2026NE000001'], pedidos: [1], pedidoIds: [empenhado.id],
      situacao: 'A_MAIS', notasFora: [], notasNaoLidas: [], notasPorValor: [], notasComItemSemAta: [], notasAnuladas: []
    };
    const notas = new Map([[comNota.id, nota(comNota.id)]]);
    expect(avisosDosPedidosParaOMenu(pedidos, ITENS, HOJE, notas, new Map([[empenhado.id, [diferenca]]]))).toEqual({
      comAviso: r.pedidosComAviso.length,
      urgentes: r.graves + 1
    });
  });

  it('lista do mais grave ao menos grave, com o item da ata do aviso', () => {
    expect(r.pedidosComAviso.map((p) => p.pedido.id)).toEqual(['encerrada', 'corte', 'vencendo', 'empenhado']);
    expect(r.pedidosComAviso[1].itemDoAviso?.itemKey).toBe('corte');
    expect(r.pedidosComAviso[3].itemDoAviso).toBeNull();
  });

  it('saldo da CAEP só nas atas vigentes e o livre perto do fim', () => {
    // longe: 100 − (3 empenhadas + 20) = 77; perto: 50 − 10 = 40; corte: 30 − 30 = 0
    expect([r.itensVigentes, r.alocado, r.reservado, r.livre]).toEqual([3, 180, 63, 117]);
    expect(r.livrePertoDoFim.map((x) => [x.item.itemKey, x.livre, x.diasParaVencer, x.indicarAte, x.passouDoCorte])).toEqual([['perto', 40, 79, '2026-11-11', false]]);
  });

  it('prazo curto de cada aviso', () => {
    const [encerrada, corte, vencendo, empenhado] = r.pedidosComAviso;
    expect(prazoDoAviso(encerrada.avisos[0], encerrada.itemDoAviso, HOJE)).toBe('encerrou em 28/05/2026');
    expect(prazoDoAviso(corte.avisos[0], corte.itemDoAviso, HOJE)).toBe('ata termina em 2 dias');
    expect(prazoDoAviso(vencendo.avisos[0], vencendo.itemDoAviso, HOJE)).toBe('indicar até 11/11/2026');
    expect(prazoDoAviso(empenhado.avisos[0], null, HOJE)).toBe('procurar a nota pelo contrato');
  });

  it('itens sem nome curto: só os alocados à CAEP em ata vigente, da ata que acaba antes', () => {
    const lista = [
      item('com', { nomeCurto: 'Pistola' }),
      item('branco', { nomeCurto: '  ', vigenciaFinal: '2027-01-10' }),
      item('novo', { nomeCurto: null }),
      item('zerado', { alocado: 0 }),
      item('encerrado', { ataEncerrada: true })
    ];
    expect(resumoInicioEmendas([], lista, new Map(), HOJE).semNomeCurto.map((i) => i.itemKey)).toEqual(['branco', 'novo']);
  });

  it('itens com nome da ata acima de 80 letras (D12, 30/10/2026): a CAEP decide se encurta', () => {
    const longo = 'Lanterna dedicada para armas longas com acionador remoto e botão traseiro, com conexão para trilhos Picatinny, 550lm';
    const lista = [item('curto', { nomeCurto: 'Pistola' }), item('longo', { nomeCurto: longo }), item('longoZerado', { nomeCurto: longo, alocado: 0 })];
    expect(longo.length).toBeGreaterThan(NOME_LONGO);
    expect(resumoInicioEmendas([], lista, new Map(), HOJE).nomeLongo.map((i) => i.itemKey)).toEqual(['longo']);
  });
});

describe('prazo dos avisos novos (Início)', () => {
  it('cada aviso diz o que fazer, sem cair no texto da nota', () => {
    const a = (tipo: Parameters<typeof prazoDoAviso>[0]['tipo']) => prazoDoAviso({ tipo, curto: '', texto: '' }, null, '2026-10-25');
    expect(a('semEnvioCgofi')).toBe('registrar o envio à CGOFI');
    expect(a('notaEmitida')).toBe('cobrar a CGOFI ou cancelar o item');
    expect(a('credorDiferente')).toBe('conferir a nota e o item');
    expect(a('semNota')).toBe('procurar a nota pelo contrato');
  });
});

