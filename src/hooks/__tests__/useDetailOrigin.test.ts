import { describe, it, expect } from 'vitest';
import { isDetailPath, originLabel } from '../useDetailOrigin';

describe('isDetailPath: só telas de detalhe recebem a origem', () => {
  it('reconhece Ata 360, Item e Contrato 360, com ou sem ?aba=', () => {
    expect(isDetailPath('/atas/detalhe/00011%2F2026-200331')).toBe(true);
    expect(isDetailPath('/atas/detalhe/00011%2F2026-200331?aba=itens')).toBe(true);
    expect(isDetailPath('/atas/detalhe/00011%2F2026-200331/itens/00003')).toBe(true);
    expect(isDetailPath('/contratos/200331-00015-2026')).toBe(true);
    expect(isDetailPath('/contratos/200331-00015-2026?aba=pagamentos')).toBe(true);
  });

  it('listas e demais páginas não recebem', () => {
    for (const path of ['/atas', '/contratos', '/contratos?busca=2024', '/atas/saldos-unidade', '/atas/distribuicao', '/pagamentos', '/empenhos', '/admin/usuarios']) {
      expect(isDetailPath(path)).toBe(false);
    }
  });
});

describe('originLabel: nome do destino do Voltar', () => {
  it('nomeia as páginas de lista, ignorando os filtros', () => {
    expect(originLabel('/atas?situacao=CRITICO')).toBe('Atas');
    expect(originLabel('/contratos?busca=2024&gestor=Maria')).toBe('Contratos');
    expect(originLabel('/pagamentos')).toBe('Pagamentos');
    expect(originLabel('/empenhos')).toBe('Empenhos e Execução');
    expect(originLabel('/atas/distribuicao')).toBe('Distribuição');
    expect(originLabel('/atas/saldos-unidade')).toBe('Por unidade interna');
    expect(originLabel('/atas/orgaos-participantes')).toBe('Por órgão partícipe');
    expect(originLabel('/instrumentos')).toBe('Visão Geral');
  });

  it('nomeia as telas de detalhe de origem', () => {
    expect(originLabel('/atas/detalhe/00011%2F2026-200331?aba=itens')).toBe('a ata');
    expect(originLabel('/atas/detalhe/00011%2F2026-200331/itens/00003')).toBe('o item');
    expect(originLabel('/contratos/200331-00015-2026')).toBe('o contrato');
  });

  it('origem desconhecida devolve nulo, e o Voltar cai na lista padrão', () => {
    expect(originLabel('/admin/usuarios')).toBeNull();
    expect(originLabel('/')).toBeNull();
  });
});
