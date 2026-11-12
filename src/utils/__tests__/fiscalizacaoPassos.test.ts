import { describe, expect, it } from 'vitest';
import type { MovimentoEntrega } from '../../services/fiscalizacaoService';
import { proximasDoGrupo, proximasEtapas, rotuloDoAvanco, voltaDoItem } from '../fiscalizacaoPassos';

const item = (etapa: string, extra: Record<string, unknown> = {}) =>
  ({ etapa, pagoEm: null, origem: 'CARGA', emenda: null, responsavel: 'SFC', pedidoId: null, ...extra }) as Parameters<typeof proximasEtapas>[0] & { pedidoId: string | null };

let n = 0;
const mov = (tipo: MovimentoEntrega['tipo'], etapa: string | null, data = '2026-11-01'): MovimentoEntrega => ({
  id: `m${++n}`, tipo, etapa: etapa as MovimentoEntrega['etapa'], data, documentoSei: null, observacao: null, criadoPorNome: null, criadoEm: `${data}T12:00:00Z`
});

describe('proximasEtapas', () => {
  it('segue um passo por vez e se divide depois da produção', () => {
    expect(proximasEtapas(item('ORDEM'))).toEqual(['PRODUCAO']);
    expect(proximasEtapas(item('PRODUCAO'))).toEqual(['TRANSITO', 'RETIRADA', 'CONTROLADO', 'ENTREGUE']);
    expect(proximasEtapas(item('ENTREGUE'))).toEqual(['TRP']);
  });

  it('no pagamento espera a nota paga; depois, Ofício à SAL só em emenda', () => {
    expect(proximasEtapas(item('PAGAMENTO'))).toEqual([]);
    expect(proximasEtapas(item('PAGAMENTO', { pagoEm: '2026-10-30' }))).toEqual(['FINALIZADO']);
    expect(proximasEtapas(item('PAGAMENTO', { pagoEm: '2026-10-30', origem: 'EMENDA' }))).toEqual(['SAL']);
  });

  it('item da área requisitante não tem passo', () => {
    expect(proximasEtapas(item('PRODUCAO', { responsavel: 'AREA' }))).toEqual([]);
  });

  it('itens juntos só seguem pelo que serve a todos', () => {
    expect(proximasDoGrupo([item('PRODUCAO'), item('TRANSITO')])).toEqual(['ENTREGUE']);
    expect(proximasDoGrupo([item('ORDEM'), item('TRP')])).toEqual([]);
  });

  it('o botão diz o passo; com escolha, "Registrar o andamento"', () => {
    expect(rotuloDoAvanco(['TRP'])).toBe('Registrar o recebimento provisório');
    expect(rotuloDoAvanco(['TRANSITO', 'ENTREGUE'])).toBe('Registrar o andamento');
    expect(rotuloDoAvanco([])).toBeNull();
  });
});

describe('voltaDoItem', () => {
  it('volta ao passo anterior registrado e apaga o último', () => {
    const ms = [mov('ETAPA', 'ENTREGUE', '2026-11-05'), mov('ETAPA', 'TRANSITO', '2026-10-20'), mov('CARGA', 'PRODUCAO', '2026-08-01')];
    const v = voltaDoItem(item('ENTREGUE'), ms);
    expect(v.para).toBe('TRANSITO');
    expect(v.apaga?.etapa).toBe('ENTREGUE');
  });

  it('pula o passo já desfeito e a volta', () => {
    const ms = [mov('VOLTA', 'PRODUCAO'), mov('DESFEITO', 'TRANSITO'), mov('ETAPA', 'PRODUCAO'), mov('CARGA', 'ORDEM')];
    expect(voltaDoItem(item('PRODUCAO'), ms).para).toBe('ORDEM');
  });

  it('não volta sem passo anterior, depois de pago, nem Informação/Ordem do pedido', () => {
    expect(voltaDoItem(item('PRODUCAO'), [mov('CARGA', 'PRODUCAO')]).impede).toMatch(/Não há passo anterior/);
    expect(voltaDoItem(item('PAGAMENTO', { pagoEm: '2026-10-30' }), []).impede).toMatch(/já foi paga/);
    expect(voltaDoItem(item('ORDEM', { pedidoId: 'p1' }), [mov('ETAPA', 'ORDEM'), mov('CRIADA', 'INFO_PEDIDA')]).impede).toMatch(/Pedido 360/);
  });
});
