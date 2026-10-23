import { describe, it, expect } from 'vitest';
import { calcularKit, sugestoesDeTroca, diasEntre } from '../emendasKits';
import type { ItemCaep } from '../../services/emendasService';

const item = (k: string, extra: Partial<ItemCaep> = {}): ItemCaep => ({
  itemKey: k,
  numeroAta: '00031/2025',
  codigoUasg: '200331',
  numeroItem: k.slice(-1),
  descricao: `Item ${k}`,
  codigoPdm: 10,
  valorUnitario: 100,
  vigenciaFinal: '2027-06-25',
  ataEncerrada: false,
  alocado: 100,
  ...extra
});

const HOJE = '2026-10-23';
const mapa = (...xs: ItemCaep[]) => new Map(xs.map((x) => [x.itemKey, x]));

describe('calcularKit', () => {
  it('kits possíveis = o item com menos saldo; valor por kit soma os itens', () => {
    const r = calcularKit({ ativo: true, itens: [{ itemKey: 'a', quantidade: 1 }, { itemKey: 'b', quantidade: 3 }] }, mapa(item('a', { alocado: 795 }), item('b', { alocado: 30, valorUnitario: 10 })), HOJE);
    expect(r).toMatchObject({ situacao: 'disponivel', kitsPossiveis: 10, valorPorKit: 130 });
    expect(r.itemLimitante?.itemKey).toBe('b');
  });

  it('ata vencendo em até 60 dias: vence em breve, com a data', () => {
    const r = calcularKit({ ativo: true, itens: [{ itemKey: 'a', quantidade: 1 }, { itemKey: 'l', quantidade: 1 }] }, mapa(item('a'), item('l', { numeroAta: '00061/2024', vigenciaFinal: '2026-12-19' })), HOJE);
    expect(r.situacao).toBe('vence');
    expect(r.motivo).toContain('19/12/2026, daqui a 57 dias');
  });

  it('ata encerrada: indisponível inteiro, zero kits', () => {
    const r = calcularKit({ ativo: true, itens: [{ itemKey: 'v', quantidade: 1 }] }, mapa(item('v', { numeroAta: '00020/2025', vigenciaFinal: '2026-05-28', ataEncerrada: true })), HOJE);
    expect(r).toMatchObject({ situacao: 'indisponivel', kitsPossiveis: 0 });
    expect(r.motivo).toContain('encerrou em 28/05/2026');
  });

  it('item sem alocação da CAEP ou sem saldo: indisponível', () => {
    expect(calcularKit({ ativo: true, itens: [{ itemKey: 'x', quantidade: 1 }] }, mapa(), HOJE).situacao).toBe('indisponivel');
    expect(calcularKit({ ativo: true, itens: [{ itemKey: 'a', quantidade: 200 }] }, mapa(item('a')), HOJE).situacao).toBe('indisponivel');
  });

  it('desativado pela CAEP vale mais que tudo', () => {
    expect(calcularKit({ ativo: false, itens: [{ itemKey: 'a', quantidade: 1 }] }, mapa(item('a')), HOJE).situacao).toBe('desativado');
  });

  it('o saldo pode vir de fora (entrega 2: alocado menos pedidos)', () => {
    const r = calcularKit({ ativo: true, itens: [{ itemKey: 'a', quantidade: 1 }] }, mapa(item('a')), HOJE, () => 7);
    expect(r.kitsPossiveis).toBe(7);
  });
});

describe('sugestoesDeTroca', () => {
  it('mesmo código de material, ata vigente, outro item', () => {
    const velho = item('a', { ataEncerrada: true });
    const todos = [velho, item('b'), item('c', { codigoPdm: 99 }), item('d', { ataEncerrada: true })];
    expect(sugestoesDeTroca(velho, todos).map((i) => i.itemKey)).toEqual(['b']);
  });
});

describe('diasEntre', () => {
  it('conta dias de calendário', () => {
    expect(diasEntre('2026-10-23', '2026-12-19')).toBe(57);
  });
});
