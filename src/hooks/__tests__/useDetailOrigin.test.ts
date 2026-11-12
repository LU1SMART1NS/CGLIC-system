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

  it('reconhece o Pedido 360 das emendas, pelo número ou pelo identificador interno', () => {
    expect(isDetailPath('/emendas/parlamentares/3166/pedidos/2026/1')).toBe(true);
    expect(isDetailPath('/emendas/parlamentares/3166/pedidos/2026/1?aba=execucao')).toBe(true);
    expect(isDetailPath('/emendas/pedidos/id/8a1b')).toBe(true);
    expect(isDetailPath('/emendas/parlamentares/3166')).toBe(true);
    expect(isDetailPath('/emendas/parlamentares/3166?aba=pedidos')).toBe(true);
    expect(isDetailPath('/emendas/parlamentares')).toBe(false);
    expect(isDetailPath('/emendas/emendas/2026/31660008')).toBe(true);
    expect(isDetailPath('/emendas/emendas?situacao=sem')).toBe(false);
    expect(isDetailPath('/emendas/parlamentares?tipo=SENADOR')).toBe(false);
    expect(isDetailPath('/emendas/pedidos')).toBe(false);
    expect(isDetailPath('/emendas/pedidos?ver=autor')).toBe(false);
  });

  it('listas e demais páginas não recebem', () => {
    for (const path of ['/atas', '/contratos', '/contratos?busca=2024', '/itens', '/atas/distribuicao', '/pagamentos', '/empenhos', '/admin/usuarios']) {
      expect(isDetailPath(path)).toBe(false);
    }
  });
});

describe('originLabel: nome do destino do Voltar', () => {
  it('nomeia as páginas de lista, ignorando os filtros; Atas, Contratos e Itens são abas da Carteira', () => {
    expect(originLabel('/atas?situacao=CRITICO')).toBe('Carteira');
    expect(originLabel('/contratos?busca=2024&gestor=Maria')).toBe('Carteira');
    expect(originLabel('/pagamentos')).toBe('Pagamentos');
    expect(originLabel('/empenhos')).toBe('Empenhos');
    expect(originLabel('/atas/distribuicao')).toBe('Distribuição');
    expect(originLabel('/itens')).toBe('Carteira');
    expect(originLabel('/itens?unidade=cglic')).toBe('Carteira');
    expect(originLabel('/instrumentos')).toBe('Início');
  });

  it('atas a montar: a tela recebe a origem e o Voltar leva à lista "Atas a montar"', () => {
    expect(isDetailPath('/atas/montar/2026/797/42841176000116')).toBe(true);
    expect(originLabel('/atas?ver=montar')).toBe('Atas a montar');
    expect(originLabel('/atas?ver=montar&ordem=valor:desc')).toBe('Atas a montar');
    expect(originLabel('/atas/montar')).toBe('Atas a montar');
  });

  it('nomeia as páginas de Emendas e o Pedido 360', () => {
    expect(originLabel('/emendas/pedidos?aviso=grave')).toBe('Pedidos');
    expect(originLabel('/emendas/inicio?gaveta=notasSemPedido')).toBe('Início');
    expect(originLabel('/emendas/parlamentares/3166/pedidos/2026/1')).toBe('o pedido');
    expect(originLabel('/emendas/pedidos/id/8a1b?aba=itens')).toBe('o pedido');
    expect(originLabel('/emendas/parlamentares?tipo=SENADOR')).toBe('Parlamentares');
    expect(originLabel('/emendas/parlamentares/3166?aba=emendas')).toBe('o parlamentar');
    expect(originLabel('/emendas/emendas?situacao=sem')).toBe('Emendas');
    expect(originLabel('/emendas/emendas/2026/31660008?aba=execucao')).toBe('a emenda');
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
