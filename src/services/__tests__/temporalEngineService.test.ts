import { describe, it, expect } from 'vitest';
import {
  parseDateBRT,
  formatDateISO,
  addDays,
  addBusinessDays,
  isWeekend,
  differenceInDays,
  differenceInBusinessDays,
  deriveTemporalStatus,
  deriveAtencaoNivel,
  calculateDeadline,
  REGRAS_OPERACIONAIS_PADRAO
} from '../temporalEngineService';
import type { RegraPrazoConfig } from '../../types/temporal';

describe('Fase 2 — Motor de Prazos e Agenda Contratual (temporalEngineService)', () => {

  describe('1. Parsing e Manipulação de Datas (Timezone America/Sao_Paulo)', () => {
    it('parseDateBRT normaliza strings de data na meia-noite local', () => {
      const d = parseDateBRT('2026-11-30');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2026);
      expect(d!.getMonth()).toBe(10); // 0-indexed (Novembro)
      expect(d!.getDate()).toBe(30);
      expect(d!.getHours()).toBe(0);
    });

    it('parseDateBRT lida com strings ISO completas sem distorcer o dia', () => {
      const d = parseDateBRT('2026-07-15T14:30:00Z');
      expect(d).not.toBeNull();
      expect(formatDateISO(d!)).toBe('2026-07-15');
    });

    it('parseDateBRT retorna null para entradas inválidas ou vazias', () => {
      expect(parseDateBRT(null)).toBeNull();
      expect(parseDateBRT('')).toBeNull();
      expect(parseDateBRT('data-invalida')).toBeNull();
    });
  });

  describe('2. Cálculos em Dias Corridos', () => {
    it('addDays soma e subtrai dias corretamente', () => {
      const base = parseDateBRT('2026-10-01')!;
      const future = addDays(base, 15);
      const past = addDays(base, -10);

      expect(formatDateISO(future)).toBe('2026-10-16');
      expect(formatDateISO(past)).toBe('2026-09-21');
    });

    it('differenceInDays calcula a distância exata em dias corridos', () => {
      const d1 = parseDateBRT('2026-10-01')!;
      const d2 = parseDateBRT('2026-10-15')!;

      expect(differenceInDays(d2, d1)).toBe(14);
      expect(differenceInDays(d1, d2)).toBe(-14);
    });
  });

  describe('3. Cálculos em Dias Úteis e Feriados', () => {
    it('isWeekend identifica sábados e domingos', () => {
      const sabado = parseDateBRT('2026-09-26')!; // Sábado
      const domingo = parseDateBRT('2026-09-27')!; // Domingo
      const segunda = parseDateBRT('2026-09-28')!; // Segunda-feira

      expect(isWeekend(sabado)).toBe(true);
      expect(isWeekend(domingo)).toBe(true);
      expect(isWeekend(segunda)).toBe(false);
    });

    it('addBusinessDays pula fins de semana ao avançar dias úteis', () => {
      // Quinta-feira 24/09/2026 + 3 dias úteis -> Sexta (25), Segunda (28), Terça (29)
      const quinta = parseDateBRT('2026-09-24')!;
      const target = addBusinessDays(quinta, 3);

      expect(formatDateISO(target)).toBe('2026-09-29');
    });

    it('addBusinessDays respeita feriados opcionais fornecidos', () => {
      // Quinta 24/09/2026 + 3 dias úteis com Sexta 25/09 sendo feriado -> Segunda (28), Terça (29), Quarta (30)
      const quinta = parseDateBRT('2026-09-24')!;
      const feriados = ['2026-09-25'];
      const target = addBusinessDays(quinta, 3, feriados);

      expect(formatDateISO(target)).toBe('2026-09-30');
    });

    it('differenceInBusinessDays calcula corretamente a contagem de dias úteis', () => {
      const inicio = parseDateBRT('2026-09-21')!; // Segunda
      const fim = parseDateBRT('2026-09-28')!; // Próxima Segunda (5 dias úteis)

      expect(differenceInBusinessDays(fim, inicio)).toBe(5);
    });
  });

  describe('4. Estado Temporal vs Nível de Atenção', () => {
    it('deriveTemporalStatus classifica estados temporais independentemente de risco', () => {
      expect(deriveTemporalStatus(45)).toBe('FUTURO');
      expect(deriveTemporalStatus(20)).toBe('VENCE_EM_BREVE');
      expect(deriveTemporalStatus(0)).toBe('VENCE_HOJE');
      expect(deriveTemporalStatus(-5)).toBe('ATRASADO');
      expect(deriveTemporalStatus(-5, true)).toBe('CONCLUIDO');
    });

    it('deriveAtencaoNivel classifica urgência de forma separada', () => {
      expect(deriveAtencaoNivel(100, 'FUTURO')).toBe('NORMAL');
      expect(deriveAtencaoNivel(45, 'FUTURO')).toBe('ATENCAO');
      expect(deriveAtencaoNivel(10, 'VENCE_EM_BREVE')).toBe('CRITICO');
      expect(deriveAtencaoNivel(-2, 'ATRASADO')).toBe('CRITICO');
      expect(deriveAtencaoNivel(0, 'CONCLUIDO')).toBe('NORMAL');
    });
  });

  describe('5. Motor Central e Explicabilidade do Prazo', () => {
    it('calculateDeadline calcula data alvo e gera explicabilidade transparente', () => {
      const regra = REGRAS_OPERACIONAIS_PADRAO.PRORROGACAO_180D;
      const refDate = parseDateBRT('2026-09-23')!;

      const result = calculateDeadline({
        dataBase: '2027-03-31',
        fonteDataBase: 'Contratos.gov.br',
        regra,
        currentDate: refDate
      });

      expect(result).not.toBeNull();
      // 2027-03-31 - 180 dias = 2026-10-02
      expect(result!.dataAlvo).toBe('2026-10-02');
      expect(result!.explicabilidade.dataBase).toBe('2027-03-31');
      expect(result!.explicabilidade.fonteDataBase).toBe('Contratos.gov.br');
      expect(result!.explicabilidade.regraNome).toBe('Início da Análise de Prorrogação (180d)');
      expect(result!.explicabilidade.regraTipo).toBe('OPERACIONAL');
      expect(result!.explicabilidade.unidadeContagem).toBe('DIAS_CORRIDOS');
      expect(result!.explicabilidade.offsetDias).toBe(-180);
    });

    it('calculateDeadline lida com regras de dias úteis com explicabilidade', () => {
      const regra: RegraPrazoConfig = {
        id: 'OFICIO_RESPOSTA',
        nome: 'Manifestação Formal',
        tipo: 'OPERACIONAL',
        unidadeContagem: 'DIAS_UTEIS',
        offsetDias: 10,
        descricao: 'Prazo concedido para resposta ao ofício'
      };

      const refDate = parseDateBRT('2026-09-23')!; // Quarta-feira
      const result = calculateDeadline({
        dataBase: '2026-09-23',
        regra,
        currentDate: refDate
      });

      expect(result).not.toBeNull();
      // Quarta 23/09 + 10 dias úteis = Quarta 07/10/2026
      expect(result!.dataAlvo).toBe('2026-10-07');
      expect(result!.diasRestantes).toBe(14); // 14 dias corridos
      expect(result!.statusTemporal).toBe('VENCE_EM_BREVE');
    });

    it('regras padrão são classificadas como OPERACIONAL e não como obrigação legal compulsória', () => {
      for (const key of Object.keys(REGRAS_OPERACIONAIS_PADRAO)) {
        const r = REGRAS_OPERACIONAIS_PADRAO[key];
        expect(['OPERACIONAL', 'INTERNA', 'CONFIGURAVEL']).toContain(r.tipo);
        expect(r.descricao).toBeDefined();
      }
    });
  });

});
