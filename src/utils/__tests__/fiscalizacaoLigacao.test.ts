import { describe, it, expect, vi } from 'vitest';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { linhaParaEntrega, linhaParaItemDaAta } from '../../services/fiscalizacaoService';
import { gruposALigar, normalizar, sugestaoDeItem } from '../fiscalizacaoLigacao';
import { linhaDeLigacao } from '../fiscalizacaoMesa';

const base = linhaParaEntrega({ id: 'e1', contract_key: '200331-00030-2025', contrato_numero: '00030/2025', quantidade: 1, origem: 'CARGA', responsavel: 'SFC', etapa: 'ORDEM', fiscalizacao: 'SFC' });
const e = (p: Partial<EntregaFiscalizacao>): EntregaFiscalizacao => ({ ...base, ...p });

const detidos = linhaParaItemDaAta({ item_key: '00031/2025-200331-00001', nome_curto: null, descricao_item: 'Caminhonete 4x4 caracterizada com compartimento de detidos', contratado: 20 });
const treino = linhaParaItemDaAta({ item_key: '00031/2025-200331-00002', nome_curto: 'Viatura de treinamento', descricao_item: 'Caminhonete 4x4 para treinamento', contratado: 5 });

describe('item da ata', () => {
  it('lê ata e número da chave', () => {
    expect(detidos).toMatchObject({ ata: '00031/2025', numero: '00001', nome: null, contratado: 20 });
  });
});

describe('grupos a ligar', () => {
  it('normaliza acento, caixa e pontuação', () => {
    expect(normalizar('  Viatura  4x4 – CARACTERIZADA ')).toBe('viatura 4x4 caracterizada');
    expect(normalizar('Câmera Corporal')).toBe('camera corporal');
  });

  it('agrupa pelo texto da planilha no contrato; ignora o que já tem item; maiores primeiro', () => {
    const gs = gruposALigar([
      e({ id: 'a', itemTexto: 'Viatura 4x4' }),
      e({ id: 'b', itemTexto: 'VIATURA 4X4' }),
      e({ id: 'c', itemTexto: 'Guincho' }),
      e({ id: 'd', itemTexto: 'Guincho', contractKey: 'outro' }),
      e({ id: 'x', itemTexto: 'Viatura 4x4', itemKey: '00031/2025-200331-00001' })
    ]);
    expect(gs.map((g) => g.es.map((x) => x.id))).toEqual([['a', 'b'], ['c'], ['d']]);
  });
});

describe('sugestão de item', () => {
  it('só quando um único item casa com o texto', () => {
    expect(sugestaoDeItem('compartimento de detidos', [detidos, treino])).toBe(detidos.itemKey);
    expect(sugestaoDeItem('Viatura de treinamento tática', [detidos, treino])).toBe(treino.itemKey);
    expect(sugestaoDeItem('Caminhonete 4x4', [detidos, treino])).toBeNull();
    expect(sugestaoDeItem('', [detidos])).toBeNull();
  });
});

describe('passo da mesa', () => {
  const es = [e({ id: 'a', itemTexto: 'Viatura 4x4' }), e({ id: 'b', itemTexto: 'Guincho' })];
  it('com itens da ata: com o fiscal, uma ação', () => {
    const ligar = vi.fn();
    const l = linhaDeLigacao(es, true, ligar);
    expect(l).toMatchObject({ tom: 'eu', titulo: 'Ligar ao item da ata · 2 itens da planilha' });
    l?.acoes[0].faz();
    expect(ligar).toHaveBeenCalled();
  });
  it('sem item da ata no contrato: espera a Vinculação', () => {
    expect(linhaDeLigacao(es, false, vi.fn())).toMatchObject({ tom: 'espera', quem: 'Vinculação', acoes: [] });
  });
  it('tudo ligado: sem passo', () => {
    expect(linhaDeLigacao([e({ itemKey: 'k' })], true, vi.fn())).toBeNull();
  });
});
