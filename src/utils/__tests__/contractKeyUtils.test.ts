import { describe, it, expect } from 'vitest';
import { resolveContractKey } from '../contractKeyUtils';

describe('contractKeyUtils.resolveContractKey - Identidade Canônica de Gestão de Contrato (SaldoARP 3.0)', () => {
  describe('Formato 1 — contrato administrativo (NNNNN/AAAA)', () => {
    it('deve derivar a chave para "00012/2016"', () => {
      const r = resolveContractKey('200331', '00012/2016');
      expect(r.key).toBe('200331-00012-2016');
      expect(r.tipo).toBe('CONTRATO');
      expect(r.deterministico).toBe(true);
      expect(r.ano).toBe('2016');
      expect(r.numero).toBe('00012');
    });

    it('deve derivar a chave para "00110/2020"', () => {
      const r = resolveContractKey('200331', '00110/2020');
      expect(r.key).toBe('200331-00110-2020');
      expect(r.tipo).toBe('CONTRATO');
    });

    it('deve normalizar número sem zeros à esquerda ("5/2025")', () => {
      const r = resolveContractKey('200331', '5/2025');
      expect(r.key).toBe('200331-00005-2025');
      expect(r.numero).toBe('00005');
    });

    it('deve expandir ano de 2 dígitos para o século XXI ("12/16" -> 2016)', () => {
      const r = resolveContractKey('200331', '12/16');
      expect(r.key).toBe('200331-00012-2016');
      expect(r.ano).toBe('2016');
      expect(r.deterministico).toBe(true);
    });

    it('deve remover espaços em branco nas extremidades do número', () => {
      const r = resolveContractKey('200331', '  00012/2016  ');
      expect(r.key).toBe('200331-00012-2016');
    });

    it('REGRESSÃO — "00052/2018" NUNCA deve usar o ano de data_assinatura (bug original)', () => {
      // O contrato real 00052/2018 (UG 200331) foi assinado em 2019-01-23.
      // A implementação anterior derivava o ano da data de assinatura e
      // gerava incorretamente ".../2019". O ano deve vir SEMPRE do número.
      const r = resolveContractKey('200331', '00052/2018', '2019-01-23');
      expect(r.key).toBe('200331-00052-2018');
      expect(r.ano).toBe('2018');
      expect(r.tipo).toBe('CONTRATO');
      expect(r.deterministico).toBe(true);
    });

    it('deve funcionar com UASG diferente de 200331', () => {
      const r = resolveContractKey('200330', '00012/2016');
      expect(r.key).toBe('200330-00012-2016');
      expect(r.uasg).toBe('200330');
    });

    it('deve aplicar a UASG padrão (200331) quando ausente', () => {
      const r = resolveContractKey(undefined, '00012/2016');
      expect(r.uasg).toBe('200331');
      expect(r.key).toBe('200331-00012-2016');
    });

    it('deve normalizar UASG numérica e com caracteres não numéricos', () => {
      expect(resolveContractKey(200331, '00012/2016').key).toBe('200331-00012-2016');
      expect(resolveContractKey(' 200331 ', '00012/2016').key).toBe('200331-00012-2016');
    });
  });

  describe('Formato 2 — Nota de Empenho direta (AAAANEnnnnnn)', () => {
    it('deve derivar a chave para "2021NE000171" preservando o prefixo NE (não é contrato "00000/AAAA")', () => {
      const r = resolveContractKey('200331', '2021NE000171');
      expect(r.key).toBe('200331-NE00171-2021');
      expect(r.tipo).toBe('NE');
      expect(r.deterministico).toBe(true);
      expect(r.numero).toBe('NE00171');
      expect(r.ano).toBe('2021');
    });

    it('deve aceitar "ne" em minúsculas (case-insensitive)', () => {
      const r = resolveContractKey('200331', '2021ne000171');
      expect(r.key).toBe('200331-NE00171-2021');
    });

    it('NÃO deve confundir NE com o formato de contrato administrativo', () => {
      const r = resolveContractKey('200331', '2022NE000357');
      expect(r.numero).not.toMatch(/^\d+$/); // preserva o prefixo "NE", não vira número puro
      expect(r.key).toBe('200331-NE00357-2022');
    });
  });

  describe('Fallback — ano não determinável pelo número', () => {
    it('deve usar a data como fallback quando o número não contém "/"', () => {
      const r = resolveContractKey('200331', '00244', '2025-03-10');
      expect(r.tipo).toBe('FALLBACK');
      expect(r.deterministico).toBe(false);
      expect(r.ano).toBe('2025');
      expect(r.key).toBe('200331-00244-2025');
    });

    it('deve aceitar um ano isolado de 4 dígitos como fallback (não apenas datas ISO completas)', () => {
      const r = resolveContractKey('200331', 'ABC-123', '2026');
      expect(r.tipo).toBe('FALLBACK');
      expect(r.ano).toBe('2026');
      expect(r.numero).toBe('ABC123'); // sanitizado: alfanumérico, maiúsculo, sem heurística de agrupamento
    });

    it('NÃO deve aplicar a expansão de século (2 dígitos) a um ano de fallback', () => {
      // "26" não é aceito como ano de fallback isolado — evita ambiguidade
      // que só é resolvida para o padrão NNNNN/AAAA do próprio número.
      const r = resolveContractKey('200331', 'XYZ', '26');
      expect(r.tipo).toBe('INVALIDO');
    });
  });

  describe('Formato inválido / ausência de ano', () => {
    it('deve retornar INVALIDO para número vazio', () => {
      expect(resolveContractKey('200331', '').tipo).toBe('INVALIDO');
      expect(resolveContractKey('200331', '   ').tipo).toBe('INVALIDO');
      expect(resolveContractKey('200331', null).tipo).toBe('INVALIDO');
      expect(resolveContractKey('200331', undefined).tipo).toBe('INVALIDO');
    });

    it('deve retornar INVALIDO (chave vazia) quando não há número reconhecível nem fallback', () => {
      const r = resolveContractKey('200331', '12345'); // dígitos puros, sem "/", sem NE, sem fallback
      expect(r.tipo).toBe('INVALIDO');
      expect(r.key).toBe('');
      expect(r.ano).toBe('');
    });

    it('deve retornar INVALIDO para formato de separador não suportado (ex.: "12-2016")', () => {
      const r = resolveContractKey('200331', '12-2016');
      expect(r.tipo).toBe('INVALIDO');
    });

    it('nunca deve lançar exceção para entradas malformadas', () => {
      expect(() => resolveContractKey('200331', 'abc/def')).not.toThrow();
      expect(() => resolveContractKey('', '')).not.toThrow();
    });
  });

  describe('Validação de colisão de fonte (não é responsabilidade da função corrigir)', () => {
    it('dois registros com o mesmo número real (duplicidade na fonte) produzem a MESMA chave — comportamento esperado', () => {
      // Caso real encontrado na auditoria: dois contratos distintos da API
      // (id 624628 e 624668) compartilham o número "00104/2025". A função
      // de identidade não deve — e não pode — resolver isso: duplicidade de
      // dado-fonte é um problema de dados, não de derivação de chave.
      const a = resolveContractKey('200331', '00104/2025');
      const b = resolveContractKey('200331', '00104/2025');
      expect(a.key).toBe(b.key);
      expect(a.key).toBe('200331-00104-2025');
    });
  });
});
