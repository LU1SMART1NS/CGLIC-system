import { describe, it, expect } from 'vitest';
import { avisosDeEmpenho } from '../emendasEmpenho';
import { avisoGrave, ROTULO_AVISO, TIPOS_AVISO, GRAVIDADE_DO_AVISO, atasDoPedido, avisosDoPedido, linhasComEmpenhoAnulado, contaDosItens, faltaEnvioCgofi, rodadasDoPedido, notasEmitidasDepoisDaAnulacao, notaEmitidaSemRegistro, conferirNumeroDaEmenda, lerNumeroDaEmenda, numeroDaEmendaEmTexto, documentosDaEtapa, intervaloDeDatas, itensDaLinha, linhasDaLista, linhasPorAta, numerosSei, precoParaEmenda, itensSemEmpenhoAutorizado, proximaAcao, reservadoPorItem, reservaDoItem, resumoDasLinhas, rodadaDoPedido, seiDaEtapa, situacaoDaLinha, solicitacoesSemAta, tarefasDoPedido, valorDaLinha, valorDoPedido, valorDoPedidoNaEtapa } from '../emendasPedidos';
import type { ConferenciaEmpenho, NotaDaLinha } from '../../services/emendasService';
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
  quantidade: 1, beneficiarioId: null, cancelada: false, canceladaMotivo: null,
  empenhoDocumentoSei: null, contratoNumero: null, despachoDocumentoSei: null, ...extra
});
const pedido = (extra: Partial<PedidoEmenda>): PedidoEmenda => ({
  id: 'p' + Math.random(), numero: 1, autorId: 'C:1', etapa: 'RESERVADO', origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-10-20',
  minutaEm: null, minutaDocumentoSei: null, oficioNumero: null, oficioDocumentoSei: null, oficioProcessoSei: null, oficioEm: null, divergencia: null, devolvidoEm: null, siopEmenda: null, siopEmendaAno: null,
  siopValor: null, siopGnd: null, conferidoEm: null, solicitadoEm: null, solicitadoDocumentoSei: null, autorizadoEm: null, autorizadoDocumentoSei: null, cgofiEm: null, cgofiDocumentoSei: null,
  empenhadoEm: null, empenhadoDocumentosSei: [], contratacaoEm: null, contratacaoDocumentosSei: [], canceladoEm: null,
  canceladoMotivo: null, versao: 1, atualizadoPorNome: null, atualizadoEm: null, linhas: [], devolucoes: [], documentos: [], pedidoOrigemId: null, pedidoOrigemNome: null, anulacoes: [], emendaId: null, outrasEmendas: [], ...extra
});
const itens = new Map([item('a'), item('b', { valorUnitario: 10, numeroAta: '00061/2024', vigenciaFinal: '2026-12-19' }), item('v', { ataEncerrada: true, numeroAta: '00020/2025', vigenciaFinal: '2026-05-28' })].map((i) => [i.itemKey, i]));
const kit = linha({ tipo: 'KIT', itemKey: null, kitId: 'k', kitComposicao: [{ itemKey: 'a', quantidade: 1 }, { itemKey: 'b', quantidade: 2 }], quantidade: 10 });

describe('pedidos das emendas', () => {
  it('kit ocupa N vezes a composição do dia', () => {
    expect(itensDaLinha(kit)).toEqual([{ itemKey: 'a', quantidade: 10 }, { itemKey: 'b', quantidade: 20 }]);
  });

  it('lista de pedidos: item pelo nome curto, beneficiário pela sigla, kit pelo nome e sem beneficiário = null', () => {
    const catalogo = new Map([item('a', { nomeCurto: 'Carabina 5,56 mm' }), item('b')].map((i) => [i.itemKey, i] as const));
    const bens = new Map([['b1', { nome: 'Polícia Militar de Minas Gerais', sigla: 'PMMG' }], ['b2', { nome: 'Guarda de Sorocaba', sigla: '' }]]);
    const p = pedido({
      linhas: [
        linha({ itemKey: 'a', quantidade: 10, beneficiarioId: 'b1' }),
        linha({ itemKey: 'b', quantidade: 2, beneficiarioId: 'b2' }),
        linha({ tipo: 'KIT', itemKey: null, kitNome: 'Kit Academia', quantidade: 1, beneficiarioNome: 'PMRJ antigo' }),
        linha({ itemKey: 'a', quantidade: 5, cancelada: true })
      ]
    });
    const r = linhasDaLista(p, catalogo, bens);
    expect(r.map((x) => [x.quantidade, x.nome, x.beneficiario, x.kit])).toEqual([
      [10, 'Carabina 5,56 mm', 'PMMG', false],
      [2, 'b', 'Guarda de Sorocaba', false],
      [1, 'Kit Academia', 'PMRJ antigo', true]
    ]);
    expect(r[0].beneficiarioNome).toBe('Polícia Militar de Minas Gerais');
    expect(linhasDaLista(pedido({ linhas: [linha({ itemKey: 'a' })] }), catalogo, bens)[0].beneficiario).toBeNull();
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
    expect(avisosDoPedido(pedido({ reservadoEm: '2026-09-01', linhas: [linha({ beneficiarioId: 'b1' })] }), itens, HOJE).map((a) => a.curto)).toEqual(['52 dias sem ofício']);
    // Devolvido: o pedido volta para a minuta, com o aviso; os 30 dias contam da devolução, não da reserva.
    const devolvido = pedido({ reservadoEm: '2026-09-01', divergencia: 'valor diferente', devolvidoEm: '2026-10-20', linhas: [linha({ beneficiarioId: 'b1' })] });
    expect(avisosDoPedido(devolvido, itens, HOJE).map((a) => [a.tipo, a.texto])).toEqual([['divergencia', 'Ofício devolvido em 20/10/2026: valor diferente']]);
    expect(avisosDoPedido({ ...devolvido, devolvidoEm: '2026-09-10' }, itens, HOJE).map((a) => a.curto)).toEqual(['Ofício devolvido', '43 dias sem ofício']);
    expect(avisosDoPedido(pedido({ etapa: 'CGOFI', linhas: [linha({ itemKey: 'v' })] }), itens, HOJE)[0].tipo).toBe('ataVencida');
    expect(avisosDoPedido(pedido({ linhas: [kit] }), itens, HOJE)[0].texto).toContain('Ata 00061/2024 vence em 57 dias');
    expect(avisosDoPedido(pedido({ etapa: 'CONFERIDO', linhas: [linha({ itemKey: 'v' })] }), itens, HOJE)[0].texto).toBe('Ata 00020/2025 encerrada em 28/05/2026: trocar o item ou tirá-lo do pedido');
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

describe('aviso de pedido parado em etapa', () => {
  it('amarelo, conta da entrada na etapa atual e só de Ofício a CGOFI', () => {
    const l = [linha({ beneficiarioId: 'b1' })];
    const parado = (extra: Partial<PedidoEmenda>) => avisosDoPedido(pedido({ linhas: l, ...extra }), itens, HOJE).find((x) => x.tipo === 'pedidoParado');
    const a = parado({ etapa: 'SOLICITADO', solicitadoEm: '2026-09-01' });
    expect(a?.curto).toBe('52 dias parado');
    expect(a && avisoGrave(a)).toBe(false);
    expect(parado({ etapa: 'SOLICITADO', solicitadoEm: '2026-10-20' })).toBeUndefined();
    expect(parado({ etapa: 'EMPENHADO', empenhadoEm: '2026-01-01' })).toBeUndefined();
    expect(parado({ etapa: 'CGOFI', cgofiEm: null })).toBeUndefined();
  });
});

describe('aviso de item sem beneficiário', () => {
  it('amarelo, conta só linhas ativas e some depois do empenho ou do cancelamento', () => {
    const l = [linha({}), linha({}), linha({ beneficiarioId: 'b1' }), linha({ cancelada: true })];
    const a = avisosDoPedido(pedido({ linhas: l }), itens, HOJE).find((x) => x.tipo === 'semBeneficiario');
    expect(a?.curto).toBe('2 sem beneficiário');
    expect(a && avisoGrave(a)).toBe(false);
    expect(avisosDoPedido(pedido({ etapa: 'EMPENHADO', linhas: l }), itens, HOJE).some((x) => x.tipo === 'semBeneficiario')).toBe(false);
    expect(avisosDoPedido(pedido({ etapa: 'CANCELADO', linhas: l }), itens, HOJE).some((x) => x.tipo === 'semBeneficiario')).toBe(false);
  });
});

describe('etiqueta curta dos avisos na lista', () => {
  it('cada aviso tem até 4 palavras e o mais grave vem primeiro', () => {
    const p = pedido({ reservadoEm: '2026-09-01', linhas: [linha({ itemKey: 'v', beneficiarioId: 'b1' })] });
    const a = avisosDoPedido(p, itens, HOJE);
    expect(a.map((x) => x.curto)).toEqual(['Ata encerrada', '52 dias sem ofício']);
    expect(a.every((x) => x.curto.split(' ').length <= 4)).toBe(true);
    expect(a[1].texto).toBe('52 dias sem ofício desde a reserva (01/09/2026)');
  });
});

describe('nota e execução das linhas empenhadas (migration 164)', () => {
  const nota = (linhaId: string, extra: Partial<import('../../services/emendasService').NotaDaLinha> = {}) => ({
    linhaId, nota: null, regra: null, motivo: null, contractKey: null, empenhoId: null, valorEmpenhado: null, valorLiquidado: null, valorPago: null,
    entregaPrevista: null, entregaPrevistaValor: null, emitidaEm: null, atualizadoEm: null, ...extra
  });

  it('a nota da linha é a achada pelo sistema; a execução conta cada nota uma vez', async () => {
    const { execucaoDoPedido, notaDaLinha } = await import('../emendasPedidos');
    const l1 = linha({ id: 'l1' }), l2 = linha({ id: 'l2' }), l3 = linha({ id: 'l3' }), l4 = linha({ id: 'l4' });
    const notas = new Map([
      ['l1', nota('l1', { nota: '2026NE000100', regra: 'CONTRATO', empenhoId: 'e1', valorEmpenhado: 1000, valorLiquidado: 400, valorPago: 300, entregaPrevista: '2026-12-01', entregaPrevistaValor: 500 })],
      ['l2', nota('l2', { nota: '2026NE000100', regra: 'CONTRATO', empenhoId: 'e1', valorEmpenhado: 1000, valorLiquidado: 400, valorPago: 300, entregaPrevista: '2026-11-15', entregaPrevistaValor: 200 })],
      ['l3', nota('l3', { nota: '2026NE000101', regra: 'SEI', empenhoId: 'e2', valorEmpenhado: 50 })],
      ['l4', nota('l4', { motivo: 'CONTRATO_SEM_NOTA' })]
    ]);
    expect(notaDaLinha(l3, notas)).toBe('2026NE000101');
    expect(notaDaLinha(l1, notas)).toBe('2026NE000100');
    const p = pedido({ etapa: 'EMPENHADO', linhas: [l1, l2, l3, l4] });
    expect(execucaoDoPedido(p, notas)).toEqual({ notas: 2, empenhado: 1050, liquidado: 400, pago: 300, proximaEntrega: { data: '2026-11-15', valor: 200 }, linhasSemNota: 1 });
    expect(avisosDoPedido(p, itens, HOJE, notas).find((a) => a.tipo === 'semNota')?.texto).toBe('1 item sem nota de empenho');
  });
});

describe('etapa Contratado pelo Contratos.gov.br', () => {
  const nota = (linhaId: string, extra: Partial<import('../../services/emendasService').NotaDaLinha> = {}) => ({
    linhaId, nota: null, regra: null, motivo: null, contractKey: null, empenhoId: null, valorEmpenhado: null, valorLiquidado: null, valorPago: null,
    entregaPrevista: null, entregaPrevistaValor: null, emitidaEm: null, atualizadoEm: null, ...extra
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

describe('uma solicitação de empenho para cada ata (migration 178)', () => {
  const A = '00031/2025-200331';
  const B = '00048/2025-200331';
  const catalogo = new Map(
    [
      item(`${A}-00001`, { numeroAta: '00031/2025', nomeCurto: 'Carabina', fornecedor: 'FORNECEDOR A' }),
      item(`${A}-00002`, { numeroAta: '00031/2025', descricao: 'Coldre de cintura', fornecedor: 'FORNECEDOR A' }),
      item(`${B}-00001`, { numeroAta: '00048/2025', nomeCurto: 'Mira optrônica', fornecedor: 'FORNECEDOR B' })
    ].map((i) => [i.itemKey, i])
  );
  const linhas = [
    linha({ itemKey: `${A}-00001`, quantidade: 4 }),
    linha({ itemKey: `${A}-00001`, quantidade: 4 }),
    linha({ tipo: 'KIT', itemKey: null, kitId: 'k', kitComposicao: [{ itemKey: `${A}-00002`, quantidade: 1 }, { itemKey: `${B}-00001`, quantidade: 1 }], quantidade: 3 }),
    linha({ itemKey: '00018/2025-200331-00002', quantidade: 1, cancelada: true })
  ];
  const doc = (numero: string, ataKey: string | null, assinadaEm: string | null = null) => ({ id: numero, linhas: [], etapa: 'AUTORIZACAO' as const, numero, data: '2026-09-23', ataKey, assinadaEm });

  it('as atas vêm das linhas ativas e dos kits, com fornecedor, itens somados e a situação de cada solicitação', () => {
    const p = pedido({ etapa: 'AUTORIZADO', linhas, documentos: [doc('37098929', A, '2026-09-24')] });
    const atas = atasDoPedido(p, catalogo);
    expect(atas.map((a) => [a.numeroAta, a.situacao, a.solicitacoes.map((x) => x.numero)])).toEqual([
      ['00048/2025', 'falta', []],
      ['00031/2025', 'assinada', ['37098929']]
    ]);
    expect(atas[1].fornecedor).toBe('FORNECEDOR A');
    expect(atas[1].itens).toEqual([
      { itemKey: `${A}-00001`, numeroItem: 1, nome: 'Carabina', quantidade: 8 },
      { itemKey: `${A}-00002`, numeroItem: 2, nome: 'Coldre de cintura', quantidade: 3 }
    ]);
  });

  it('avisa o item sem empenho autorizado depois da autorização; pedido sem nenhuma solicitação não avisa', () => {
    const comFalta = pedido({ etapa: 'CGOFI', linhas, documentos: [doc('37098929', A, '2026-09-24'), doc('37104393', B)] });
    // O kit leva um item de cada ata: sem a assinatura da ata B, ele não está autorizado.
    expect(contaDosItens(comFalta)).toEqual({ total: 3, solicitados: 3, autorizados: 2 });
    expect(itensSemEmpenhoAutorizado(comFalta)?.curto).toBe('1 item sem autorização');
    expect(itensSemEmpenhoAutorizado(comFalta)?.texto).toContain('1 de 3 itens sem empenho autorizado');
    expect(avisosDoPedido(comFalta, catalogo, HOJE).map((a) => a.tipo)).toContain('semAutorizacao');
    expect(itensSemEmpenhoAutorizado(pedido({ etapa: 'CGOFI', linhas }))).toBeNull();
    expect(itensSemEmpenhoAutorizado(pedido({ etapa: 'SOLICITADO', linhas, documentos: [doc('37098929', A)] }))).toBeNull();
    const completo = pedido({ etapa: 'CONTRATACAO', linhas, documentos: [doc('37098929', A, '2026-09-24'), doc('37104393', B, '2026-09-25')] });
    expect(itensSemEmpenhoAutorizado(completo)).toBeNull();
  });

  it('a ata aceita uma solicitação por rodada: assinada só quando todas estão (migration 179)', () => {
    const duas = pedido({ etapa: 'CONTRATACAO', linhas, documentos: [doc('35673658', A, '2026-05-27'), doc('36536429', A, null), doc('37104393', B, '2026-09-24')] });
    const a = atasDoPedido(duas).find((x) => x.numeroAta === '00031/2025')!;
    expect(a.solicitacoes.map((x) => x.numero)).toEqual(['35673658', '36536429']);
    expect([a.situacao, a.assinadaEm]).toEqual(['aguardando', null]);
    // A ata A tem duas solicitações e as linhas não estão marcadas: os dois itens de A ficam sem solicitação.
    expect(contaDosItens(duas)).toEqual({ total: 3, solicitados: 0, autorizados: 0 });
    expect(itensSemEmpenhoAutorizado(duas)?.curto).toBe('3 itens sem autorização');
    const assinadas = pedido({ ...duas, documentos: [doc('35673658', A, '2026-05-27'), doc('36536429', A, '2026-08-11'), doc('37104393', B, '2026-09-24')] });
    const b = atasDoPedido(assinadas).find((x) => x.numeroAta === '00031/2025')!;
    expect([b.situacao, b.assinadaEm]).toEqual(['assinada', '2026-08-11']);
    // A ata está assinada, mas cada item precisa estar marcado numa das solicitações para ter o empenho autorizado.
    expect(itensSemEmpenhoAutorizado(assinadas)?.curto).toBe('3 itens sem autorização');
    const marca = (d: ReturnType<typeof doc>, ls: typeof linhas) => ({ ...d, linhas: ls.map((l) => ({ linhaId: l.id, quantidade: l.quantidade })) });
    const marcadas = pedido({
      ...duas,
      documentos: [marca(doc('35673658', A, '2026-05-27'), [linhas[0], linhas[2]]), marca(doc('36536429', A, '2026-08-11'), [linhas[1]]), doc('37104393', B, '2026-09-24')]
    });
    expect(contaDosItens(marcadas)).toEqual({ total: 3, solicitados: 3, autorizados: 3 });
    expect(itensSemEmpenhoAutorizado(marcadas)).toBeNull();
  });

  it('solicitação sem ata aparece para o gestor ligar', () => {
    expect(solicitacoesSemAta(pedido({ documentos: [doc('35938854', null), doc('37098929', A)] }))).toEqual(['35938854']);
  });

  it('documentos da etapa trazem a data de cada um e os números das colunas que ainda não estão na tabela', () => {
    const p = pedido({
      etapa: 'CONTRATACAO',
      contratacaoEm: '2026-10-20',
      contratacaoDocumentosSei: ['37262327'],
      documentos: [
        { id: '37262155', linhas: [], etapa: 'CONTRATACAO', numero: '37262155', data: '2026-10-15', ataKey: null, assinadaEm: null },
        { id: '37262327', linhas: [], etapa: 'CONTRATACAO', numero: '37262327', data: '2026-10-20', ataKey: null, assinadaEm: null }
      ],
      linhas: [linha({ despachoDocumentoSei: '36000001' })]
    });
    expect(documentosDaEtapa(p, 'CONTRATACAO')).toEqual([
      { numero: '37262155', data: '2026-10-15' },
      { numero: '37262327', data: '2026-10-20' },
      { numero: '36000001', data: '2026-10-20' }
    ]);
    expect(documentosDaEtapa(p, 'CONFERIDO')).toEqual([]);
  });

  it('etapa com documentos de dias diferentes mostra o intervalo', () => {
    expect(intervaloDeDatas(['2026-10-15', '2026-10-15', '2026-10-20', null])).toBe('15/10 a 20/10/2026');
    expect(intervaloDeDatas(['2025-12-30', '2026-01-02'])).toBe('30/12/2025 a 02/01/2026');
    expect(intervaloDeDatas(['2026-09-24'])).toBe('24/09/2026');
    expect(intervaloDeDatas([null])).toBeNull();
  });
});

describe('situação por linha (migration 180): a solicitação cobre itens de uma ata e cada linha anda no seu ritmo', () => {
  const A = '00031/2025-200331';
  const B = '00048/2025-200331';
  const l1 = linha({ id: 'l1', itemKey: `${A}-00001`, quantidade: 8 });
  const l2 = linha({ id: 'l2', itemKey: `${A}-00001`, quantidade: 3 });
  const l3 = linha({ id: 'l3', itemKey: `${B}-00001`, quantidade: 5 });
  const doc = (id: string, numero: string, ataKey: string, assinadaEm: string | null, linhas: string[]) => ({ id, etapa: 'AUTORIZACAO' as const, numero, data: '2026-09-23', ataKey, assinadaEm, linhas: linhas.map((linhaId) => ({ linhaId, quantidade: 1 })) });
  const semNotas = new Map<string, NotaDaLinha>();
  const nota = (linhaId: string, n: string | null, contractKey: string | null): NotaDaLinha => ({ linhaId, nota: n, regra: n ? 'SEI' : null, motivo: n ? null : 'CONTRATO_SEM_NOTA', contractKey, empenhoId: n ? 'e' : null, valorEmpenhado: null, valorLiquidado: null, valorPago: null, entregaPrevista: null, entregaPrevistaValor: null, emitidaEm: null, atualizadoEm: null });

  it('antes da solicitação, a situação é a etapa do pedido', () => {
    expect(situacaoDaLinha(pedido({ etapa: 'OFICIO', linhas: [l1] }), l1, semNotas)).toMatchObject({ situacao: 'ANTES', rotulo: 'Ofício recebido' });
  });

  it('nota já emitida antes de a CAEP registrar o empenho (migration 189): a linha fica empenhada e o pedido avisa', () => {
    const p = pedido({ etapa: 'CGOFI', linhas: [l1, l2, l3], documentos: [doc('d1', '37098929', A, '2026-06-01', ['l1', 'l2']), doc('d3', '37104393', B, '2026-06-01', ['l3'])] });
    const notas = new Map<string, NotaDaLinha>([['l1', { ...nota('l1', '2026NE000230', null), regra: 'FORNECEDOR', emitidaEm: '2026-06-16' }]]);
    expect(situacaoDaLinha(p, l1, notas)).toMatchObject({ situacao: 'EMPENHADO', detalhe: 'NE 2026NE000230 emitida em 16/06/2026 · registre o empenho', pendente: false });
    expect(situacaoDaLinha(p, l3, notas)).toMatchObject({ situacao: 'NA_CGOFI' });
    expect(notaEmitidaSemRegistro(p, notas)).toMatchObject({ tipo: 'notaEmitida', curto: 'Nota já emitida', texto: 'Nota de empenho emitida em 16/06/2026 para 1 item: registre o empenho', linhaId: 'l1' });
    expect(avisosDoPedido(p, itens, HOJE, notas).some((a) => a.tipo === 'notaEmitida')).toBe(true);
    expect(notaEmitidaSemRegistro({ ...p, etapa: 'AUTORIZADO' }, notas)?.texto).toContain('registre o envio à CGOFI e o empenho');
    expect(notaEmitidaSemRegistro({ ...p, etapa: 'EMPENHADO' }, notas)).toBeNull();
    expect(notaEmitidaSemRegistro(p, semNotas)).toBeNull();
  });

  it('envio à CGOFI por rodada (migration 193): a rodada nova assinada e não enviada pede o envio; pedido antigo não', () => {
    const enviada = { ...doc('d1', '35272441', A, '2026-04-17', ['l1']), enviosCgofi: [{ numero: '35294101', data: '2026-04-17' }] };
    const nova = doc('d3', '37082291', B, '2026-09-23', ['l3']);
    const p = pedido({ etapa: 'CONTRATACAO', linhas: [l1, l3], documentos: [enviada, nova] });
    expect(faltaEnvioCgofi(p).map((d) => d.numero)).toEqual(['37082291']);
    expect(situacaoDaLinha(p, l3, semNotas)).toMatchObject({ situacao: 'AUTORIZADO', detalhe: 'falta o envio à CGOFI', pendente: true });
    expect(avisosDoPedido(p, itens, HOJE, semNotas).find((a) => a.tipo === 'semEnvioCgofi')?.texto).toContain('37082291 (ata 00048/2025, assinada em 23/09/2026)');
    expect(avisosDoPedido(p, itens, HOJE, semNotas).find((a) => a.tipo === 'semEnvioCgofi')?.linhaId).toBe('l3');
    expect(tarefasDoPedido(p, itens, semNotas, HOJE, true).find((t) => t.chave === 'envio-cgofi')?.botao).toMatchObject({ tipo: 'envio' });
    const r = rodadasDoPedido(p, semNotas);
    expect(r.map((x) => [x.assinadaEm, x.envios.map((e) => e.numero), x.faltaEnvio])).toEqual([['2026-04-17', ['35294101'], 0], ['2026-09-23', [], 1]]);
    expect(r[1].atasSemEnvio).toEqual(['00048/2025']);
    // Com a nota já ligada, a linha segue a nota.
    const comNota = new Map<string, NotaDaLinha>([['l3', nota('l3', '2026NE000423', null)]]);
    expect(situacaoDaLinha(p, l3, comNota).situacao).not.toBe('AUTORIZADO');
    // Pedido antigo: nenhum envio ligado às solicitações → nada falta.
    const antigo = pedido({ etapa: 'CONTRATACAO', linhas: [l1, l3], documentos: [doc('d1', '35272441', A, '2026-04-17', ['l1']), nova] });
    expect(faltaEnvioCgofi(antigo)).toEqual([]);
    expect(rodadasDoPedido(antigo, semNotas)[1]).toMatchObject({ faltaEnvio: 0, semRegistro: 1 });
    // Em "Autorizado", as assinadas são o próximo passo: faltam, mas sem aviso nem tarefa à parte.
    const autorizado = pedido({ etapa: 'AUTORIZADO', linhas: [l3], documentos: [nova] });
    expect(faltaEnvioCgofi(autorizado)).toHaveLength(1);
    expect(avisosDoPedido(autorizado, itens, HOJE, semNotas).some((a) => a.tipo === 'semEnvioCgofi')).toBe(false);
    expect(tarefasDoPedido(autorizado, itens, semNotas, HOJE, true).some((t) => t.chave === 'envio-cgofi')).toBe(false);
  });

  it('solicitação só com itens de empenho anulado não pede envio à CGOFI e a rodada mostra o empenho anulado (pedido 528)', () => {
    const anulada = { ...l3, cancelada: true, canceladaMotivo: 'Empenho anulado em 28/09/2026: voltou à interlocução no pedido 607.' };
    const enviada = { ...doc('d1', '35938854', A, '2026-06-15', ['l1']), enviosCgofi: [{ numero: '35946757', data: '2026-06-19' }] };
    const semEnvio = doc('d3', '35939233', B, '2026-06-16', []);
    const anulacao = { id: 'a1', total: false, destino: 'INTERLOCUCAO' as const, novoPedidoId: null, novoPedidoNome: "pedido 2/2026", notas: ['2026NE000250'], linhas: [{ linhaId: 'l3', novaLinhaId: null, itemKey: l3.itemKey, kitNome: null, quantidade: 5 }], documentoSei: '37079404', anuladoEm: '2026-09-28', motivo: 'x', criadoPorNome: null };
    const p = pedido({ etapa: 'CONTRATACAO', linhas: [l1, anulada], documentos: [enviada, semEnvio], anulacoes: [anulacao] });
    expect(faltaEnvioCgofi(p)).toEqual([]);
    const r = rodadasDoPedido(p, semNotas);
    expect(r[1]).toMatchObject({ faltaEnvio: 0, semRegistro: 0, soAnulados: true, linhas: '1 com empenho anulado', anulados: { itens: 1, notas: ['2026NE000250'], anuladoEm: '2026-09-28' } });
    expect(r[0]).toMatchObject({ soAnulados: false, anulados: { itens: 0 } });
    // Linha cancelada à mão (sem registro de anulação): a regra de antes vale.
    const semRegistro = pedido({ ...p, anulacoes: [] });
    expect(faltaEnvioCgofi(semRegistro).map((d) => d.numero)).toEqual(['35939233']);
  });

  it('notas do pedido emitidas na data da anulação ou depois, fora das linhas marcadas: a compra pode ter sido refeita', () => {
    const p = pedido({ etapa: 'CONTRATACAO', linhas: [l1, l2, l3] });
    const notas = new Map<string, NotaDaLinha>([
      ['l1', { ...nota('l1', '2026NE000422', null), emitidaEm: '2026-10-02', valorEmpenhado: 8365.28 }],
      ['l2', { ...nota('l2', '2026NE000279', null), emitidaEm: '2026-07-10', valorEmpenhado: 100 }],
      ['l3', { ...nota('l3', '2026NE000250', null), emitidaEm: '2026-06-22', valorEmpenhado: 0 }]
    ]);
    expect(notasEmitidasDepoisDaAnulacao(p, notas, new Set(['l3']), '2026-09-28').map((x) => x.nota)).toEqual(['2026NE000422']);
    expect(notasEmitidasDepoisDaAnulacao(p, notas, new Set(['l1', 'l3']), '2026-09-28')).toEqual([]);
    expect(notasEmitidasDepoisDaAnulacao(p, notas, new Set(['l3']), '')).toEqual([]);
  });

  it('a linha sabe qual solicitação a cobre: pela ligação gravada ou pela solicitação única da ata', () => {
    const p = pedido({ etapa: 'AUTORIZADO', linhas: [l1, l2, l3], documentos: [doc('d1', '37098929', A, '2026-09-24', ['l1']), doc('d2', '37099000', A, null, []), doc('d3', '37104393', B, '2026-09-24', [])] });
    expect(situacaoDaLinha(p, l1, semNotas)).toMatchObject({ situacao: 'AUTORIZADO', solicitacao: { numero: '37098929' } });
    // l2: a ata tem duas solicitações e nenhuma a cobre → a informar.
    expect(situacaoDaLinha(p, l2, semNotas)).toMatchObject({ situacao: 'SOLICITACAO_A_INFORMAR', pendente: true });
    // l3: a ata B tem uma solicitação só → ela cobre a linha mesmo sem ligação gravada.
    expect(situacaoDaLinha(p, l3, semNotas)).toMatchObject({ situacao: 'AUTORIZADO', solicitacao: { numero: '37104393' } });
    const comL2 = pedido({ ...p, documentos: [doc('d1', '37098929', A, '2026-09-24', ['l1']), doc('d2', '37099000', A, null, ['l2']), doc('d3', '37104393', B, '2026-09-24', [])] });
    expect(situacaoDaLinha(comL2, l2, semNotas)).toMatchObject({ situacao: 'AGUARDANDO_ASSINATURA', detalhe: 'solicitação 37099000 na DGFNSP' });
  });

  it('depois do empenho: na CGOFI, empenhada (com ou sem nota ligada), na CCGA e contratada', () => {
    const docs = [doc('d1', '37098929', A, '2026-09-24', []), doc('d3', '37104393', B, '2026-09-24', [])];
    expect(situacaoDaLinha(pedido({ etapa: 'CGOFI', linhas: [l1, l3], documentos: docs }), l1, semNotas).situacao).toBe('NA_CGOFI');
    const emp = pedido({ etapa: 'EMPENHADO', linhas: [l1, l3], documentos: docs });
    expect(situacaoDaLinha(emp, l1, semNotas)).toMatchObject({ situacao: 'EMPENHADO', pendente: true });
    expect(situacaoDaLinha(emp, l1, new Map([['l1', nota('l1', '2026NE000115', null)]]))).toMatchObject({ situacao: 'EMPENHADO', pendente: false, detalhe: 'NE 2026NE000115 ligada · aguarda o envio à CCGA' });
    const ccga = pedido({ etapa: 'CONTRATACAO', linhas: [l1, l3], documentos: docs });
    const notas = new Map([['l1', nota('l1', '2026NE000115', '200331-00138-2026')], ['l3', nota('l3', null, null)]]);
    expect(situacaoDaLinha(ccga, l1, notas)).toMatchObject({ situacao: 'CONTRATADO', rotulo: 'Contratado · 00138/2026', pendente: false });
    expect(situacaoDaLinha(ccga, l3, notas)).toMatchObject({ situacao: 'NA_CCGA', pendente: true });
    const r = resumoDasLinhas(ccga, notas);
    expect(r.texto).toBe('1 na CCGA · 1 contratado');
    expect([r.divergem, r.maisAtrasada]).toEqual([true, 'NA_CCGA']);
  });

  it('as linhas se agrupam por ata, com o fornecedor e as solicitações da ata; kits ficam à parte', () => {
    const kit = linha({ id: 'k', tipo: 'KIT', itemKey: null, kitId: 'kit', kitNome: 'Kit', kitComposicao: [{ itemKey: `${A}-00001`, quantidade: 1 }], quantidade: 2 });
    const catalogo = new Map([item(`${A}-00001`, { fornecedor: 'FORNECEDOR A' }), item(`${B}-00001`, { numeroAta: '00048/2025', fornecedor: 'FORNECEDOR B' })].map((i) => [i.itemKey, i]));
    const g = linhasPorAta(pedido({ etapa: 'AUTORIZADO', linhas: [l3, l1, kit], documentos: [doc('d1', '37098929', A, '2026-09-24', [])] }), catalogo);
    expect(g.map((x) => [x.chave, x.linhas.map((l) => l.id), x.fornecedor, x.solicitacoes.length])).toEqual([
      [A, ['l1'], 'FORNECEDOR A', 1],
      [B, ['l3'], 'FORNECEDOR B', 0],
      ['KITS', ['k'], null, 0]
    ]);
  });

  it('O que falta: o próximo passo, a solicitação que falta, a assinatura, as linhas a marcar, o beneficiário e a nota a ligar', () => {
    const catalogo = new Map([item(`${A}-00001`), item(`${B}-00001`, { numeroAta: '00048/2025' })].map((i) => [i.itemKey, i]));
    const p = pedido({ etapa: 'AUTORIZADO', linhas: [l1, l2, l3], documentos: [doc('d1', '37098929', A, '2026-09-24', ['l1']), doc('d2', '37099000', A, null, [])] });
    const t = tarefasDoPedido(p, catalogo, semNotas, HOJE, true);
    expect(t.map((x) => x.chave)).toEqual(['proxima', `sol-${B}`, 'ass-37099000', `marcar-${A}`, 'beneficiario']);
    expect(t[0]).toMatchObject({ titulo: 'Registrar o envio à CGOFI', tom: 'acao', botao: { tipo: 'proxima' } });
    expect(t[1].botao).toMatchObject({ tipo: 'solicitacao', ataKey: B });
    expect(t[2].botao).toMatchObject({ tipo: 'solicitacao', ataKey: A, numero: '37099000', troca: true });
    expect(t[4].botao).toMatchObject({ tipo: 'alterar' });
    const emp = pedido({ etapa: 'EMPENHADO', linhas: [l1], documentos: [doc('d1', '37098929', A, '2026-09-24', ['l1'])] });
    const te = tarefasDoPedido(emp, catalogo, semNotas, HOJE, true);
    expect(te.map((x) => [x.chave, x.tom])).toEqual([['proxima', 'acao'], ['beneficiario', 'atencao'], ['semNota', 'espera']]);
    // Quem não gere não tem os botões, mas vê as tarefas.
    expect(tarefasDoPedido(p, catalogo, semNotas, HOJE, false).find((x) => x.chave === 'beneficiario')?.botao).toBeUndefined();
  });
});

describe('nº da emenda (migration 186)', () => {
  it('aceita 8 dígitos com espaços ou o código de 12 com o ano; recusa o resto', () => {
    expect(lerNumeroDaEmenda('4095 0004')).toEqual({ numero: '40950004', ano: null });
    expect(lerNumeroDaEmenda('2026 4095 0004')).toEqual({ numero: '40950004', ano: 2026 });
    expect(lerNumeroDaEmenda('2025.4095.0004')).toEqual({ numero: '40950004', ano: 2025 });
    expect(lerNumeroDaEmenda('elef')).toBeNull();
    expect(lerNumeroDaEmenda('4095 004')).toBeNull();
    expect(lerNumeroDaEmenda('1926 4095 0004')).toBeNull();
    expect(numeroDaEmendaEmTexto('40950004')).toBe('4095 0004');
  });

  it('confere o código do autor com os outros pedidos', () => {
    const meu = pedido({ id: 'p1', autorId: 'A' });
    const lista = [
      pedido({ id: 'p2', autorId: 'B', siopEmenda: '40950011' }),
      pedido({ id: 'p3', autorId: 'A', siopEmenda: '40950004', siopEmendaAno: 2026 }),
      pedido({ id: 'p4', autorId: 'A', siopEmenda: '40950004', siopEmendaAno: 2025 }),
      pedido({ id: 'p5', autorId: 'C', siopEmenda: '40950004', etapa: 'CANCELADO' }),
      pedido({ id: 'p6', autorId: 'D', siopEmenda: '11110001' })
    ];
    const r = conferirNumeroDaEmenda(meu, '40950004', 2026, lista);
    expect(r.outroAutor.map((x) => x.id)).toEqual(['p2']);
    expect(r.mesmaEmenda.map((x) => x.id)).toEqual(['p3']);
  });
});

describe('ROTULO_AVISO — um nome por aviso em todas as telas', () => {
  it('todo tipo de aviso tem rótulo curto e a lista vai do mais grave ao mais leve', () => {
    for (const t of TIPOS_AVISO) {
      expect(ROTULO_AVISO[t]).toBeTruthy();
      expect(ROTULO_AVISO[t].split(' ').length).toBeLessThanOrEqual(7);
    }
    expect([...TIPOS_AVISO]).toEqual([...TIPOS_AVISO].sort((a, b) => GRAVIDADE_DO_AVISO[a] - GRAVIDADE_DO_AVISO[b]));
    expect(TIPOS_AVISO[0]).toBe('empenhoAnulado');
  });
  it('a etiqueta curta dos avisos de empenho é o mesmo nome do filtro', () => {
    const c: ConferenciaEmpenho = { emenda: '202612340001', itemKey: '00033/2025-200331-00003', qtdPedido: 38, qtdNasNotas: 41, notas: ['2026NE000456'], pedidoIds: ['p1'], pedidos: [1], situacao: 'A_MAIS', notasFora: [], notasNaoLidas: [], notasPorValor: [], notasComItemSemAta: [], notasAnuladas: [] };
    const [mais] = avisosDeEmpenho([c], new Map());
    const [menos] = avisosDeEmpenho([{ ...c, situacao: 'A_MENOS', qtdNasNotas: 30 }], new Map());
    expect(mais.curto).toBe(ROTULO_AVISO.empenhoAMais);
    expect(menos.curto).toBe(ROTULO_AVISO.empenhoAMenos);
  });
});

describe('empenho anulado (migration 203)', () => {
  const nota = (linhaId: string, n: string | null, valorEmpenhado: number | null): NotaDaLinha => ({ linhaId, nota: n, regra: n ? 'FORNECEDOR' : null, motivo: n ? null : 'SEM_CONTRATO', contractKey: null, empenhoId: n ? 'e' : null, valorEmpenhado, valorLiquidado: null, valorPago: null, entregaPrevista: null, entregaPrevistaValor: null, emitidaEm: null, atualizadoEm: null });
  const zerada = linha({ id: 'z', itemKey: 'a' });
  const boa = linha({ id: 'b', itemKey: 'b' });
  const semNota = linha({ id: 's', itemKey: 'a' });
  const notas = new Map([nota('z', '2026NE000088', 0), nota('b', '2026NE000093', 301912.31), nota('s', null, null)].map((n) => [n.linhaId, n]));

  it('só a linha com nota zerada no Tesouro, e só depois do envio à CGOFI', () => {
    const p = pedido({ etapa: 'CONTRATACAO', linhas: [zerada, boa, semNota] });
    expect(linhasComEmpenhoAnulado(p, notas).map((l) => l.id)).toEqual(['z']);
    expect(linhasComEmpenhoAnulado(pedido({ etapa: 'AUTORIZADO', linhas: [zerada] }), notas)).toEqual([]);
    expect(linhasComEmpenhoAnulado(pedido({ etapa: 'CONTRATACAO', linhas: [{ ...zerada, cancelada: true }] }), notas)).toEqual([]);
  });

  it('aviso grave, o primeiro da lista, com a nota no texto', () => {
    const avisos = avisosDoPedido(pedido({ etapa: 'CONTRATACAO', linhas: [zerada, boa] }), itens, HOJE, notas);
    expect(avisos[0]).toMatchObject({ tipo: 'empenhoAnulado', curto: 'Empenho anulado', linhaId: 'z' });
    expect(avisos[0].texto).toContain('2026NE000088');
    expect(avisos[0].texto).toContain('1 item não tem outra nota');
  });

  it('a linha mostra "Empenho anulado"', () => {
    const p = pedido({ etapa: 'EMPENHADO', linhas: [zerada, boa] });
    expect(situacaoDaLinha(p, zerada, notas)).toMatchObject({ situacao: 'EMPENHO_ANULADO', pendente: true });
    expect(situacaoDaLinha(p, boa, notas).situacao).not.toBe('EMPENHO_ANULADO');
  });
});


describe('reservaDoItem (reservado da CAEP na alocação)', () => {
  it('só a linha sem contrato ligado fica no reservado; cancelada e pedido cancelado não contam', () => {
    const pedidos = [
      pedido({ etapa: 'CONTRATACAO', linhas: [linha({ id: 'c1', itemKey: 'a', quantidade: 3 })] }),
      pedido({ etapa: 'EMPENHADO', linhas: [linha({ id: 'e1', itemKey: 'a', quantidade: 2 })] }),
      pedido({ etapa: 'RESERVADO', linhas: [linha({ id: 'r1', itemKey: 'a', quantidade: 5 }), linha({ id: 'r2', itemKey: 'a', quantidade: 9, cancelada: true })] }),
      pedido({ etapa: 'CANCELADO', linhas: [linha({ id: 'x', itemKey: 'a', quantidade: 50 })] }),
      pedido({ etapa: 'RESERVADO', linhas: [kit] })
    ];
    const notas = new Map([
      ['c1', { linhaId: 'c1', nota: '2026NE000184', contractKey: '200331-00175-2026' } as NotaDaLinha],
      ['e1', { linhaId: 'e1', nota: '2026NE000200', contractKey: null } as NotaDaLinha]
    ]);
    expect(reservaDoItem(pedidos, 'a', notas)).toEqual({ total: 20, semContrato: 17 });
  });
});
