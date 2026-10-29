import { describe, it, expect } from 'vitest';
import { podeIrNaMinuta, podeReservar, prazoDoOficioPelaMinuta, reajusteDoItem, rotuloDoReajuste } from '../emendasReajuste';
import { avisoGrave, avisosDoPedido, avisosDoReajuste } from '../emendasPedidos';
import type { ItemCaep, LinhaPedido, NotaDaLinha, PedidoEmenda } from '../../services/emendasService';
import type { PrecoDoItem } from '../../services/emendasQuadroService';

const HOJE = '2026-10-29';
const preco = (itemKey: string, extra: Partial<PrecoDoItem> = {}): PrecoDoItem => ({
  itemKey, precoAtual: 3700.59, dataReajuste: null, origem: null, devido: false, precoDevido: null, ...extra
});
const ESPINGARDA = '00022/2026-200331-00001';
const CAMIONETA = '00032/2025-200331-00001';

describe('situação do item pela data do reajuste (protótipo de 29/10/2026)', () => {
  it('livre até 60 dias antes; esmaecido de 60 a 45 (ainda vai na minuta); fora da minuta a menos de 45', () => {
    const p = preco(ESPINGARDA, { dataReajuste: '2027-03-26', origem: 'PRORROGACAO' });
    expect(reajusteDoItem(p, HOJE)).toMatchObject({ situacao: 'LIVRE', rotulo: null });
    const esm = reajusteDoItem(p, '2027-01-28');
    expect(esm).toMatchObject({ situacao: 'ESMAECIDO', rotulo: 'Reajuste na prorrogação, 26/03/2027' });
    expect(esm.detalhe).toBe('Saiu da reserva em 25/01/2027 (60 dias antes). O pedido já reservado ainda vai na minuta até 09/02/2027, com o prazo do ofício mais curto.');
    expect([podeReservar(esm), podeIrNaMinuta(esm)]).toEqual([false, true]);
    expect(esm.avisoNaReserva).toBe('Reajuste na prorrogação, 26/03/2027: a quantidade não pode subir. A minuta sai até 09/02/2027.');
    const fora = reajusteDoItem(p, '2027-02-15');
    expect(fora.situacao).toBe('FORA_DA_MINUTA');
    expect(fora.detalhe).toContain('Faltam 39 dias, menos que os 45 até o contrato assinado');
    expect([podeReservar(fora), podeIrNaMinuta(fora)]).toEqual([false, false]);
    expect(fora.avisoNaReserva).toMatch(/^Item suspenso: reajuste na prorrogação, .+\. Retire-o para a minuta sair\.$/);
  });

  it('reajuste devido bloqueia até o apostilamento; ata sem data-base usa o fim da vigência; sem leitura, livre', () => {
    const devido = reajusteDoItem(preco(CAMIONETA, { precoAtual: 355230, devido: true, origem: 'DEVIDO', precoDevido: 371002.21 }), HOJE);
    expect(devido).toMatchObject({ situacao: 'DEVIDO', rotulo: 'Reajuste devido, aguarda o apostilamento' });
    expect(devido.detalhe).toContain('com o reajuste, R$');
    expect(devido.avisoNaReserva).toBe('Item suspenso: aguarda o apostilamento do reajuste. Retire-o para a minuta sair.');
    expect(podeIrNaMinuta(devido)).toBe(false);
    const semBase = preco('00062/2025-200331-00003', { dataReajuste: '2026-11-03', origem: 'FIM_DA_VIGENCIA' });
    expect(reajusteDoItem(semBase, HOJE)).toMatchObject({ situacao: 'FORA_DA_MINUTA', rotulo: 'Ata sem data-base termina em 03/11/2026', avisoNaReserva: 'Item suspenso: a ata termina em 03/11/2026. Retire-o para a minuta sair.' });
    expect(rotuloDoReajuste(preco('x', { dataReajuste: '2027-01-10', origem: 'REAJUSTE' }))).toBe('Reajuste em 10/01/2027');
    expect(reajusteDoItem(undefined, HOJE).situacao).toBe('LIVRE');
  });

  it('prazo do ofício: 5 dias úteis da minuta, ou o reajuste menos 45 dias, o que vier antes', () => {
    // Segunda 09/11/2026: 5 dias úteis = segunda 16/11.
    expect(prazoDoOficioPelaMinuta('2026-11-09', [ESPINGARDA], new Map())).toEqual({ data: '2026-11-16', pela: 'DIAS_UTEIS', ata: null });
    const precos = new Map([[ESPINGARDA, preco(ESPINGARDA, { dataReajuste: '2026-12-29', origem: 'REAJUSTE' })]]);
    expect(prazoDoOficioPelaMinuta('2026-11-09', [ESPINGARDA], precos)).toEqual({ data: '2026-11-14', pela: 'REAJUSTE', ata: '00022/2026' });
  });
});

const linha = (id: string, itemKey: string): LinhaPedido => ({
  id, ordem: 1, tipo: 'ITEM', itemKey, kitId: null, kitNome: null, kitVersao: null, kitComposicao: null, quantidade: 2, beneficiarioId: 'b1',
  cancelada: false, canceladaMotivo: null, empenhoDocumentoSei: null, contratoNumero: null, despachoDocumentoSei: null
});
const pedido = (extra: Partial<PedidoEmenda>): PedidoEmenda =>
  ({ id: 'p', etapa: 'RESERVADO', autorId: 'C:1', reservadoEm: '2026-10-28', devolvidoEm: null, divergencia: null, linhas: [linha('l1', ESPINGARDA)], minutaPrecos: null, minutaValidaAte: null, anulacoes: [], documentos: [], devolucoes: [], ...extra }) as unknown as PedidoEmenda;
const nota = (linhaId: string, contratoAssinadoEm: string | null): NotaDaLinha =>
  ({ linhaId, nota: '2026NE000001', regra: 'CONTRATO', motivo: null, contractKey: null, empenhoId: 'e1', valorEmpenhado: 7401.18, valorLiquidado: 0, valorPago: 0, entregaPrevista: null, entregaPrevistaValor: null, emitidaEm: '2026-10-01', atualizadoEm: null, contratoAssinadoEm }) as NotaDaLinha;

describe('avisos do reajuste nos pedidos', () => {
  const itens = new Map<string, ItemCaep>();

  it('reservado: esmaecido pede a minuta até o limite; fora da minuta é vermelho', () => {
    const esm = avisosDoReajuste(pedido({}), '2027-01-28', new Map([[ESPINGARDA, preco(ESPINGARDA, { dataReajuste: '2027-03-26', origem: 'PRORROGACAO' })]]));
    expect(esm.map((a) => [a.tipo, a.texto])).toEqual([['reajusteProximo', 'Ata 00022/2026: reajuste na prorrogação, 26/03/2027. Envie a minuta até 09/02/2027, para o contrato sair pelo preço de hoje']]);
    const fora = avisosDoReajuste(pedido({}), '2027-02-15', new Map([[ESPINGARDA, preco(ESPINGARDA, { dataReajuste: '2027-03-26', origem: 'PRORROGACAO' })]]));
    expect(fora[0]).toMatchObject({ tipo: 'reajusteFora', curto: 'Fora da minuta' });
    expect(avisoGrave(fora[0])).toBe(true);
  });

  it('minuta com o prazo do ofício vencido pede nova minuta', () => {
    const a = avisosDoReajuste(pedido({ etapa: 'MINUTA', minutaValidaAte: '2026-11-09' }), '2026-11-10', new Map());
    expect(a.map((x) => [x.tipo, x.texto])).toEqual([['prazoDoOficio', 'O prazo do ofício venceu em 09/11/2026: gere uma nova minuta com o preço do dia']]);
    expect(avisosDoReajuste(pedido({ etapa: 'MINUTA', minutaValidaAte: '2026-11-09' }), '2026-11-09', new Map())).toEqual([]);
  });

  it('depois do ofício, sem contrato: reajuste perto avisa; reajuste devido ou preço mudado depois da minuta pede anular e voltar à minuta', () => {
    const empenhado = pedido({ etapa: 'EMPENHADO', minutaPrecos: { [ESPINGARDA]: 3700.59 } });
    const perto = avisosDoReajuste(empenhado, '2027-03-01', new Map([[ESPINGARDA, preco(ESPINGARDA, { dataReajuste: '2027-03-26', origem: 'REAJUSTE' })]]), new Map());
    expect(perto[0]).toMatchObject({ tipo: 'reajusteProximo', curto: 'Reajuste em 25 dias' });
    expect(perto[0].texto).toContain('cobre a assinatura');
    const mudou = avisosDoReajuste(empenhado, '2027-04-10', new Map([[ESPINGARDA, preco(ESPINGARDA, { precoAtual: 3860.12 })]]), new Map());
    expect(mudou[0]).toMatchObject({ tipo: 'reajusteAntesDoContrato' });
    expect(mudou[0].texto).toContain('Anule o empenho dos itens dela e volte à minuta');
    const devido = avisosDoReajuste({ ...empenhado, etapa: 'CONFERIDO' } as PedidoEmenda, '2027-03-30', new Map([[ESPINGARDA, preco(ESPINGARDA, { devido: true, origem: 'DEVIDO' })]]));
    expect(devido[0].texto).toContain('o ofício saiu com o preço antigo. Volte o pedido à minuta');
    // Contrato assinado: o preço do contrato está garantido, sem aviso.
    expect(avisosDoReajuste(empenhado, '2027-04-10', new Map([[ESPINGARDA, preco(ESPINGARDA, { precoAtual: 3860.12 })]]), new Map([['l1', nota('l1', '2027-03-10')]]))).toEqual([]);
  });

  it('em dezembro, reajuste no ano seguinte lembra que a anulação depois do ano não devolve o crédito', () => {
    const a = avisosDoReajuste(pedido({ etapa: 'EMPENHADO' }), '2026-12-10', new Map([[ESPINGARDA, preco(ESPINGARDA, { dataReajuste: '2027-01-15', origem: 'REAJUSTE' })]]));
    expect(a[0].texto).toContain('em restos a pagar o crédito não volta à emenda');
  });

  it('avisosDoPedido só traz os avisos do reajuste quando vêm os preços', () => {
    const p = pedido({ etapa: 'MINUTA', minutaValidaAte: '2026-10-20' });
    expect(avisosDoPedido(p, itens, HOJE).some((a) => a.tipo === 'prazoDoOficio')).toBe(false);
    expect(avisosDoPedido(p, itens, HOJE, undefined, undefined, undefined, new Map()).some((a) => a.tipo === 'prazoDoOficio')).toBe(true);
  });
});
