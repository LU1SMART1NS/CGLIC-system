import { describe, it, expect, vi } from 'vitest';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { linhaParaEntrega } from '../../services/fiscalizacaoService';
import { textoDoAviso } from '../fiscalizacaoEntregas';
import { comQuemEstaOItem, linhasDoContrato } from '../fiscalizacaoMesa';

const base = linhaParaEntrega({ id: 'e1', contract_key: '200331-00055-2026', contrato_numero: '00055/2026', quantidade: 10, origem: 'EMENDA', responsavel: 'SFC', etapa: 'INFO_ENVIADA', fiscalizacao: 'SFC', beneficiario_texto: 'PM-XX' });
const e = (p: Partial<EntregaFiscalizacao>): EntregaFiscalizacao => ({ ...base, ...p });

describe('aviso da entrega (migration 274)', () => {
  it('lê o aviso da leitura e escreve a frase', () => {
    expect(linhaParaEntrega({ ...base, aviso: { tipo: 'ITEM_CANCELADO', data: '2026-11-10', sei: '41234567' } }).aviso).toEqual({ tipo: 'ITEM_CANCELADO', data: '2026-11-10', sei: '41234567' });
    expect(linhaParaEntrega({ ...base, aviso: null }).aviso).toBeNull();
    expect(textoDoAviso({ tipo: 'ITEM_CANCELADO', data: '2026-11-10', sei: '41234567' })).toBe('Empenho anulado no pedido em 10/11/2026 · SEI 41234567: o item foi cancelado');
    expect(textoDoAviso({ tipo: 'ITEM_CANCELADO', data: null, sei: null })).toBe('Empenho anulado no pedido: o item foi cancelado');
    expect(textoDoAviso({ tipo: 'OUTRO_CONTRATO', contrato: '00061/2025' })).toBe('A nota deste item passou ao contrato 00061/2025');
  });

  it('a mesa mostra o aviso com o botão Encerrar e tira o item dos outros passos', () => {
    const abrir = vi.fn();
    const anulado = e({ id: 'a', aviso: { tipo: 'ITEM_CANCELADO', data: null, sei: null } });
    const outro = e({ id: 'b', aviso: { tipo: 'OUTRO_CONTRATO', contrato: '00061/2025' } });
    const normal = e({ id: 'c' });
    const { comVoce } = linhasDoContrato([anulado, outro, normal], false, abrir, () => {});
    expect(comVoce.map((l) => l.chave)).toEqual(['anulado', 'outro-contrato', 'ordem']);
    expect(comVoce[0]).toMatchObject({ tom: 'vencido', titulo: 'Empenho anulado · 1 item cancelado no pedido' });
    expect(comVoce[0].acoes[0].rotulo).toBe('Encerrar entrega');
    comVoce[0].acoes[0].faz();
    expect(abrir).toHaveBeenCalledWith('encerrar', [anulado]);
    // "Emitir a Ordem" conta só o item sem aviso.
    expect(comVoce[2].titulo).toBe('Emitir a Ordem de Fornecimento · 1 item');
    expect(comQuemEstaOItem(anulado)).toBe('VOCE');
  });
});
