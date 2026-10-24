import { describe, it, expect } from 'vitest';
import { avisosDoPedido, itensDaLinha, numerosSei, precoParaEmenda, proximaAcao, reservadoPorItem, rodadaDoPedido, seiDaEtapa, valorDaLinha, valorDoPedido, valorDoPedidoNaEtapa } from '../emendasPedidos';
import { calcularKit } from '../emendasKits';
import type { PrecoPrevisto } from '../../services/emendasQuadroService';
import type { ItemCaep, LinhaPedido, PedidoEmenda } from '../../services/emendasService';

const HOJE = '2026-10-23';
const item = (k: string, extra: Partial<ItemCaep> = {}): ItemCaep => ({
  itemKey: k, numeroAta: '00031/2025', codigoUasg: '200331', numeroItem: '00001', descricao: k, codigoPdm: 1,
  valorUnitario: 100, vigenciaFinal: '2027-06-25', ataEncerrada: false, alocado: 100, ...extra
});
const linha = (extra: Partial<LinhaPedido>): LinhaPedido => ({
  id: 'l' + Math.random(), ordem: 1, tipo: 'ITEM', itemKey: 'a', kitId: null, kitNome: null, kitVersao: null, kitComposicao: null,
  quantidade: 1, beneficiarioId: null, notaEmpenho: null, cancelada: false, canceladaMotivo: null,
  empenhoDocumentoSei: null, contratoNumero: null, despachoDocumentoSei: null, aConferir: null, planilhaRef: null, ...extra
});
const pedido = (extra: Partial<PedidoEmenda>): PedidoEmenda => ({
  id: 'p' + Math.random(), numero: 1, autorId: 'C:1', etapa: 'RESERVADO', origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-10-20',
  minutaEm: null, minutaDocumentoSei: null, oficioNumero: null, oficioDocumentoSei: null, oficioProcessoSei: null, oficioEm: null, divergencia: null, devolvidoEm: null, siopEmenda: null,
  siopValor: null, siopGnd: null, conferidoEm: null, solicitadoEm: null, solicitadoDocumentoSei: null, autorizadoEm: null, autorizadoDocumentoSei: null, cgofiEm: null, cgofiDocumentoSei: null,
  empenhadoEm: null, empenhadoDocumentosSei: [], contratacaoEm: null, contratacaoDocumentosSei: [], canceladoEm: null,
  canceladoMotivo: null, versao: 1, atualizadoPorNome: null, atualizadoEm: null, linhas: [], devolucoes: [], ...extra
});
const itens = new Map([item('a'), item('b', { valorUnitario: 10, numeroAta: '00061/2024', vigenciaFinal: '2026-12-19' }), item('v', { ataEncerrada: true, numeroAta: '00020/2025', vigenciaFinal: '2026-05-28' })].map((i) => [i.itemKey, i]));
const kit = linha({ tipo: 'KIT', itemKey: null, kitId: 'k', kitComposicao: [{ itemKey: 'a', quantidade: 1 }, { itemKey: 'b', quantidade: 2 }], quantidade: 10 });

describe('pedidos das emendas', () => {
  it('kit ocupa N vezes a composição do dia', () => {
    expect(itensDaLinha(kit)).toEqual([{ itemKey: 'a', quantidade: 10 }, { itemKey: 'b', quantidade: 20 }]);
  });

  it('reservado soma pedidos e linhas não cancelados, e pode excluir o pedido em edição', () => {
    const p1 = pedido({ linhas: [kit, linha({ itemKey: 'a', quantidade: 5 }), linha({ itemKey: 'a', quantidade: 99, cancelada: true })] });
    const p2 = pedido({ etapa: 'CANCELADO', linhas: [linha({ itemKey: 'a', quantidade: 50 })] });
    expect(Object.fromEntries(reservadoPorItem([p1, p2]))).toEqual({ a: 15, b: 20 });
    expect(reservadoPorItem([p1, p2], p1.id).size).toBe(0);
  });

  it('valor pelo preço previsto para a emenda quando vêm os preços (o mesmo do quadro), e pelo de hoje sem eles', () => {
    const precos = new Map<string, PrecoPrevisto>([
      ['a', { itemKey: 'a', precoAtual: 100, precoPrevisto: 104.02, motivo: 'PREVISTO', devido: false, efeito: '2026-12-01', percentual: 4.02, mesesEstimados: null }]
    ]);
    expect(precoParaEmenda('a', itens, precos)).toMatchObject({ previsto: 104.02, hoje: 100 });
    // Item sem preço previsto: vale o de hoje.
    expect(precoParaEmenda('b', itens, precos)).toMatchObject({ previsto: 10, hoje: 10 });
    expect(valorDaLinha(kit, itens, precos)).toBe(10 * 104.02 + 20 * 10);
    expect(valorDaLinha(kit, itens)).toBe(10 * 100 + 20 * 10);
    expect(calcularKit({ ativo: true, itens: kit.kitComposicao! }, itens, HOJE, (i) => i.alocado, precos)).toMatchObject({ valorPorKit: 124.02, valorPorKitHoje: 120 });
  });

  it('valor do pedido nas telas: o da emenda depois da conferência; antes, o previsto', () => {
    const precos = new Map<string, PrecoPrevisto>([['a', { itemKey: 'a', precoAtual: 100, precoPrevisto: 110, motivo: 'DEVIDO', devido: true, efeito: null, percentual: 10, mesesEstimados: null }]]);
    const p = pedido({ linhas: [linha({ itemKey: 'a', quantidade: 3 })] });
    expect(valorDoPedidoNaEtapa(p, itens, precos)).toEqual({ valor: 330, fonte: 'PREVISTO' });
    expect(valorDoPedidoNaEtapa({ ...p, etapa: 'CONFERIDO', siopValor: 320 }, itens, precos)).toEqual({ valor: 320, fonte: 'EMENDA' });
  });

  it('valor pelo preço da ata', () => {
    expect(valorDoPedido(pedido({ linhas: [kit] }), itens)).toBe(10 * 100 + 20 * 10);
  });

  it('avisos: 30 dias sem ofício, ofício devolvido e ata vencendo ou vencida antes do empenho', () => {
    expect(avisosDoPedido(pedido({ reservadoEm: '2026-09-01', linhas: [linha({})] }), itens, HOJE).map((a) => a.curto)).toEqual(['52 dias sem ofício']);
    // Devolvido: o pedido volta para a minuta, com o aviso; os 30 dias contam da devolução, não da reserva.
    const devolvido = pedido({ reservadoEm: '2026-09-01', divergencia: 'valor diferente', devolvidoEm: '2026-10-20', linhas: [linha({})] });
    expect(avisosDoPedido(devolvido, itens, HOJE).map((a) => [a.tipo, a.texto])).toEqual([['divergencia', 'Ofício devolvido em 20/10/2026: valor diferente']]);
    expect(avisosDoPedido({ ...devolvido, devolvidoEm: '2026-09-10' }, itens, HOJE).map((a) => a.curto)).toEqual(['Ofício devolvido', '43 dias sem ofício']);
    expect(avisosDoPedido(pedido({ etapa: 'CGOFI', linhas: [linha({ itemKey: 'v' })] }), itens, HOJE)[0].tipo).toBe('ataVencida');
    expect(avisosDoPedido(pedido({ linhas: [kit] }), itens, HOJE)[0].texto).toContain('Ata 00061/2024 vence em 57 dias');
    expect(avisosDoPedido(pedido({ etapa: 'CONFERIDO', linhas: [linha({ itemKey: 'v' })] }), itens, HOJE)[0].texto).toBe('Ata 00020/2025 encerrada em 28/05/2026: trocar o item ou tirar a linha');
    expect(avisosDoPedido(pedido({ etapa: 'EMPENHADO', linhas: [linha({ itemKey: 'v' })] }), itens, HOJE)).toEqual([]);
    expect(avisosDoPedido(pedido({ etapa: 'CONTRATACAO', linhas: [linha({ itemKey: 'v' })] }), itens, HOJE)).toEqual([]);
  });

  it('próximo passo de cada etapa, da reserva ao envio para contratação', () => {
    const ordem = ['RESERVADO', 'MINUTA', 'OFICIO', 'CONFERIDO', 'SOLICITADO', 'AUTORIZADO', 'CGOFI', 'EMPENHADO', 'CONTRATACAO'] as const;
    for (let i = 0; i < ordem.length - 1; i++) expect(proximaAcao(ordem[i])?.acao).toBe(ordem[i + 1]);
    expect(proximaAcao('CONTRATACAO')).toBeNull();
    expect(proximaAcao('RESERVADO', 2)?.rotulo).toBe('Registrar a 2ª minuta');
    expect(proximaAcao('MINUTA', 2)?.rotulo).toBe('Registrar o 2º ofício');
  });

  it('rodada e números SEI de cada etapa', () => {
    const devolucao = { rodada: 1, minutaEm: null, oficioEm: null, oficioDocumentoSei: '40555666', oficioProcessoSei: null, motivo: 'x', devolvidoEm: '2026-10-01', criadoPorNome: null };
    expect(rodadaDoPedido(pedido({}))).toBe(1);
    expect(rodadaDoPedido(pedido({ devolucoes: [devolucao] }))).toBe(2);
    expect(numerosSei('41234567, 41234568; 41234567 41.234.569')).toEqual(['41234567', '41234568', '41234569']);
    // Empenho e despacho: os do pedido e os das linhas da planilha, sem repetir.
    const p = pedido({
      etapa: 'CONTRATACAO',
      contratacaoDocumentosSei: ['35408653'],
      linhas: [linha({ empenhoDocumentoSei: '35378789', despachoDocumentoSei: '35408653' }), linha({ empenhoDocumentoSei: '35381459', despachoDocumentoSei: '35430673' })]
    });
    expect(seiDaEtapa(p, 'EMPENHADO')).toEqual(['35378789', '35381459']);
    expect(seiDaEtapa(p, 'CONTRATACAO')).toEqual(['35408653', '35430673']);
    expect(seiDaEtapa(pedido({ oficioDocumentoSei: '41234567' }), 'OFICIO')).toEqual(['41234567']);
    expect(seiDaEtapa(p, 'CONFERIDO')).toEqual([]);
    // A autorização é o documento da solicitação, assinado pela DGFNSP: o número aparece só na solicitação.
    expect(seiDaEtapa(pedido({ solicitadoDocumentoSei: '41000001', autorizadoDocumentoSei: '41000001' }), 'AUTORIZADO')).toEqual([]);
  });
});

describe('identificação e contato', () => {
  it('sem ofício, a reserva é identificada pela data; com ofício, pelo processo SEI', async () => {
    const { identificacaoDoPedido } = await import('../emendasPedidos');
    expect(identificacaoDoPedido({ oficioProcessoSei: null, reservadoEm: '2026-10-03' })).toBe('Reserva de 03/10/2026');
    expect(identificacaoDoPedido({ oficioProcessoSei: '08027.000226/2026-61', siopEmenda: '37990010', reservadoEm: '2026-10-03' })).toBe('Processo 08027.000226/2026-61');
  });

  it('sugere o último contato da assessoria usado com cada autor', async () => {
    const { ultimoContatoPorAutor } = await import('../emendasPedidos');
    const m = ultimoContatoPorAutor([
      pedido({ autorId: 'C:1', contatoNome: 'Antigo', atualizadoEm: '2026-09-01T10:00:00Z' }),
      pedido({ autorId: 'C:1', contatoNome: 'Novo', contatoTelefone: '61999990000', atualizadoEm: '2026-10-01T10:00:00Z' }),
      pedido({ autorId: 'C:2' })
    ]);
    expect(m.get('C:1')).toEqual({ contatoNome: 'Novo', contatoTelefone: '61999990000', contatoEmail: null });
    expect(m.has('C:2')).toBe(false);
  });
});

describe('pedidos que vieram das planilhas da CAEP (migration 160)', () => {
  it('identifica pelo número da emenda; reserva da planilha não tem data', async () => {
    const { identificacaoDoPedido } = await import('../emendasPedidos');
    expect(identificacaoDoPedido({ reservadoEm: '2026-10-23', siopEmenda: '37990010', origem: 'PLANILHA' })).toBe('Emenda 37990010');
    expect(identificacaoDoPedido({ reservadoEm: '2026-10-23', siopEmenda: null, origem: 'PLANILHA' })).toBe('Reserva da planilha');
  });

  it('avisa as linhas a conferir', () => {
    const p = pedido({ etapa: 'EMPENHADO', linhas: [linha({ aConferir: 'Planilha de saldo indica 5; a execução soma 4.' }), linha({ aConferir: 'x' }), linha({})] });
    expect(avisosDoPedido(p, itens, HOJE)).toEqual([{ tipo: 'aConferir', curto: '2 a conferir', texto: '2 linhas a conferir com o controle anterior da CAEP' }]);
  });

  it('monta a chave do contrato da planilha', async () => {
    const { chaveDoContratoDaEmenda } = await import('../emendasPedidos');
    expect(chaveDoContratoDaEmenda('00138/2026')).toBe('200331-00138-2026');
    expect(chaveDoContratoDaEmenda('138/2026')).toBeNull();
    expect(chaveDoContratoDaEmenda(null)).toBeNull();
  });
});

describe('prazo de indicação nos pedidos (migration 162)', () => {
  it('antes do empenho, ata a menos de 35 dias pede confirmação com a CCGA; o aviso de 60 dias fala do contrato', () => {
    const its = new Map([item('t', { numeroAta: '00003/2026', vigenciaFinal: '2026-11-22' }), item('q', { numeroAta: '00002/2026', vigenciaFinal: '2026-12-02' })].map((i) => [i.itemKey, i]));
    const p = pedido({ etapa: 'OFICIO', linhas: [linha({ itemKey: 'q' }), linha({ itemKey: 't' })] });
    const a = avisosDoPedido(p, its, HOJE);
    expect(a[0].tipo).toBe('ataNoCorte');
    expect(a[0].texto).toContain('passou do prazo de indicação (35 dias); confirmar com a CCGA');
    expect(avisosDoPedido(pedido({ etapa: 'OFICIO', linhas: [linha({ itemKey: 'q' })] }), its, HOJE)[0].texto).toBe('Ata 00002/2026 vence em 40 dias (02/12/2026): contrato assinado até lá');
    expect(avisosDoPedido(pedido({ etapa: 'EMPENHADO', linhas: [linha({ itemKey: 't' })] }), its, HOJE)).toEqual([]);
  });
});

describe('reserva para um órgão (parlamentar a definir)', () => {
  it('aviso conta dias sem parlamentar e o contato não vira sugestão de autor', async () => {
    const { avisosDoPedido, ultimoContatoPorAutor, eReservaParaOrgao } = await import('../emendasPedidos');
    const p = pedido({ autorId: null, reservadoEm: '2026-09-01', contatoNome: 'Major X', linhas: [linha({ beneficiarioId: 'b2' })] });
    expect(eReservaParaOrgao(p)).toBe(true);
    expect(avisosDoPedido(p, itens, HOJE)[0].curto).toBe('52 dias sem parlamentar');
    expect(ultimoContatoPorAutor([p]).size).toBe(0);
  });

  it('o órgão é o beneficiário das linhas', async () => {
    const { orgaoDoPedido } = await import('../emendasPedidos');
    const nome = (id: string) => ({ b1: 'CBMDF', b2: 'CBMERJ' } as Record<string, string>)[id];
    expect(orgaoDoPedido(pedido({ autorId: null, linhas: [linha({ beneficiarioId: 'b2' })] }), nome)).toBe('CBMERJ');
    expect(orgaoDoPedido(pedido({ autorId: null, linhas: [linha({ beneficiarioId: 'b1' }), linha({ beneficiarioId: 'b2' })] }), nome)).toBe('CBMDF e mais 1');
    expect(orgaoDoPedido(pedido({ autorId: null, linhas: [linha({})] }), nome)).toBeNull();
  });
});

describe('etiqueta curta dos avisos na lista', () => {
  it('cada aviso tem até 4 palavras e o mais grave vem primeiro', () => {
    const p = pedido({ reservadoEm: '2026-09-01', linhas: [linha({ itemKey: 'v', aConferir: 'x' })] });
    const a = avisosDoPedido(p, itens, HOJE);
    expect(a.map((x) => x.curto)).toEqual(['Ata encerrada', '52 dias sem ofício', '1 a conferir']);
    expect(a.every((x) => x.curto.split(' ').length <= 4)).toBe(true);
    expect(a[1].texto).toBe('52 dias sem ofício desde a reserva (01/09/2026)');
  });
});

describe('nota e execução das linhas empenhadas (migration 164)', () => {
  const nota = (linhaId: string, extra: Partial<import('../../services/emendasService').NotaDaLinha> = {}) => ({
    linhaId, nota: null, regra: null, motivo: null, contractKey: null, empenhoId: null, valorEmpenhado: null, valorLiquidado: null, valorPago: null,
    entregaPrevista: null, entregaPrevistaValor: null, atualizadoEm: null, ...extra
  });

  it('a nota digitada vale mais que a achada; a execução conta cada nota uma vez', async () => {
    const { execucaoDoPedido, notaDaLinha } = await import('../emendasPedidos');
    const l1 = linha({ id: 'l1' }), l2 = linha({ id: 'l2' }), l3 = linha({ id: 'l3', notaEmpenho: '2026NE000999' }), l4 = linha({ id: 'l4' });
    const notas = new Map([
      ['l1', nota('l1', { nota: '2026NE000100', regra: 'CONTRATO', empenhoId: 'e1', valorEmpenhado: 1000, valorLiquidado: 400, valorPago: 300, entregaPrevista: '2026-12-01', entregaPrevistaValor: 500 })],
      ['l2', nota('l2', { nota: '2026NE000100', regra: 'CONTRATO', empenhoId: 'e1', valorEmpenhado: 1000, valorLiquidado: 400, valorPago: 300, entregaPrevista: '2026-11-15', entregaPrevistaValor: 200 })],
      ['l3', nota('l3', { nota: '2026NE000101', regra: 'ITEM', empenhoId: 'e2', valorEmpenhado: 50 })],
      ['l4', nota('l4', { motivo: 'CONTRATO_SEM_NOTA' })]
    ]);
    expect(notaDaLinha(l3, notas)).toBe('2026NE000999');
    expect(notaDaLinha(l1, notas)).toBe('2026NE000100');
    const p = pedido({ etapa: 'EMPENHADO', linhas: [l1, l2, l3, l4] });
    expect(execucaoDoPedido(p, notas)).toEqual({ notas: 2, empenhado: 1050, liquidado: 400, pago: 300, proximaEntrega: { data: '2026-11-15', valor: 200 }, linhasSemNota: 1 });
    expect(avisosDoPedido(p, itens, HOJE, notas).find((a) => a.tipo === 'semNota')?.texto).toBe('1 linha sem nota de empenho');
  });
});

describe('etapa Contratado pelo Contratos.gov.br', () => {
  const nota = (linhaId: string, extra: Partial<import('../../services/emendasService').NotaDaLinha> = {}) => ({
    linhaId, nota: null, regra: null, motivo: null, contractKey: null, empenhoId: null, valorEmpenhado: null, valorLiquidado: null, valorPago: null,
    entregaPrevista: null, entregaPrevistaValor: null, atualizadoEm: null, ...extra
  });

  it('conta por nota: contratado só quando toda nota tem contrato no sistema e o pedido foi à CCGA', async () => {
    const { contratosDoPedido } = await import('../emendasPedidos');
    const l1 = linha({ id: 'l1' }), l2 = linha({ id: 'l2' }), l3 = linha({ id: 'l3', contratoNumero: '00138/2026' });
    const parcial = new Map([
      ['l1', nota('l1', { nota: '2026NE000100', contractKey: '200331-00045-2026' })],
      ['l2', nota('l2', { nota: '2026NE000100' })],
      // Número da planilha sem contrato no sistema não conta.
      ['l3', nota('l3', { nota: '2026NE000101', motivo: 'CONTRATO_FORA' })]
    ]);
    const p = pedido({ etapa: 'CONTRATACAO', linhas: [l1, l2, l3] });
    expect(contratosDoPedido(p, parcial)).toEqual({ notas: 2, comContrato: 1, contratos: ['200331-00045-2026'], contratado: false });
    const completo = new Map(parcial).set('l3', nota('l3', { nota: '2026NE000101', contractKey: '200331-00138-2026' }));
    expect(contratosDoPedido(p, completo).contratado).toBe(true);
    expect(contratosDoPedido({ ...p, etapa: 'EMPENHADO' }, completo).contratado).toBe(false);
    expect(contratosDoPedido(pedido({ etapa: 'CONTRATACAO', linhas: [] }), completo).contratado).toBe(false);
  });
});
