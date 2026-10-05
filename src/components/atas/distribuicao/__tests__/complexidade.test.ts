import { describe, it, expect } from 'vitest';
import { aplicarAjuste, classificarAta, classificarContrato, mesesDeVigencia } from '../complexidade';

describe('complexidade de ata', () => {
  it('Baixa com 1 item, Média de 2 a 5, Alta com 6+ itens ou 2+ fornecedores', () => {
    expect(classificarAta(1, 1)).toEqual({ nivel: 'BAIXA', motivo: '1 item' });
    expect(classificarAta(5, 1)).toEqual({ nivel: 'MEDIA', motivo: '5 itens' });
    expect(classificarAta(6, 1)).toEqual({ nivel: 'ALTA', motivo: '6 itens' });
    expect(classificarAta(2, 2)).toEqual({ nivel: 'ALTA', motivo: '2 itens · 2 fornecedores' });
  });

  it('sem itens no banco fica em Média, com o motivo à vista', () => {
    expect(classificarAta(0, 0)).toEqual({ nivel: 'MEDIA', motivo: 'Sem itens no banco' });
  });
});

describe('complexidade de contrato', () => {
  it('compra: Baixa até 12 meses (vigência padrão de um ano), Média acima', () => {
    expect(classificarContrato('Compras', 6)).toEqual({ nivel: 'BAIXA', motivo: 'Compra · 6 meses' });
    expect(classificarContrato('Compras', 12).nivel).toBe('BAIXA');
    expect(classificarContrato('Compras', 13).nivel).toBe('MEDIA');
  });

  it('serviço e TIC: Alta com 12+ meses (execução continuada), Média abaixo', () => {
    expect(classificarContrato('Serviços', 24)).toEqual({ nivel: 'ALTA', motivo: 'Serviços · 24 meses' });
    expect(classificarContrato('Informática (TIC)', 12).nivel).toBe('ALTA');
    expect(classificarContrato('Serviços', 6).nivel).toBe('MEDIA');
  });

  it('obra e serviço de engenharia são Alta em qualquer duração', () => {
    expect(classificarContrato('Obras', 4).nivel).toBe('ALTA');
    expect(classificarContrato('Serviços de Engenharia', 3).nivel).toBe('ALTA');
  });

  it('sem categoria ("A definir" ou vazia) fica em Média, sem virar Baixa', () => {
    expect(classificarContrato('A definir', 30)).toEqual({ nivel: 'MEDIA', motivo: 'Sem categoria · 30 meses' });
    expect(classificarContrato(undefined, null)).toEqual({ nivel: 'MEDIA', motivo: 'Sem categoria · vigência sem datas' });
  });
});

describe('mesesDeVigencia', () => {
  it('conta os meses entre início e fim', () => {
    expect(mesesDeVigencia('2025-01-01', '2026-01-01')).toBe(12);
    expect(mesesDeVigencia('2025-01-01', null)).toBeNull();
    expect(mesesDeVigencia('2026-01-01', '2025-01-01')).toBeNull();
  });
});

describe('aplicarAjuste', () => {
  it('sem ajuste, vale a automática', () => {
    const auto = classificarContrato('Compras', 6);
    expect(aplicarAjuste(auto)).toBe(auto);
  });

  it('com ajuste, vale a faixa do coordenador e a automática fica guardada', () => {
    const auto = classificarContrato('Compras', 6);
    expect(aplicarAjuste(auto, { nivel: 'ALTA', motivo: 'Mão de obra com dedicação exclusiva', ajustadoPorNome: 'Furtado', atualizadoEm: '2026-10-05' })).toEqual({
      nivel: 'ALTA',
      motivo: 'Mão de obra com dedicação exclusiva',
      ajuste: { automatica: { nivel: 'BAIXA', motivo: 'Compra · 6 meses' }, ajustadoPorNome: 'Furtado', atualizadoEm: '2026-10-05' }
    });
  });
});
