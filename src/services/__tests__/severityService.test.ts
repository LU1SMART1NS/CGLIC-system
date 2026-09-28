import { describe, it, expect } from 'vitest';
import {
  severityFromAtencaoNivel,
  severityFromReajusteRadarNivel,
  severityFromPaymentAlertNivel,
  severityFromPaymentStatusPrazo,
  severityFromAttentionPriorityLevel
} from '../severityService';

describe('severityService — Taxonomia Canônica de Severidade (Fase 10-A.2)', () => {
  describe('severityFromAtencaoNivel', () => {
    it('deve retornar CRITICA quando o estado temporal está ATRASADO, independentemente do nível de atenção', () => {
      expect(severityFromAtencaoNivel('CRITICO', 'ATRASADO')).toBe('CRITICA');
      expect(severityFromAtencaoNivel('ATENCAO', 'ATRASADO')).toBe('CRITICA');
    });

    it('deve retornar URGENTE quando o estado temporal é VENCE_HOJE', () => {
      expect(severityFromAtencaoNivel('CRITICO', 'VENCE_HOJE')).toBe('URGENTE');
    });

    it('deve retornar URGENTE para nivelAtencao CRITICO sem estado temporal informado', () => {
      expect(severityFromAtencaoNivel('CRITICO')).toBe('URGENTE');
    });

    it('deve retornar ATENCAO para nivelAtencao ATENCAO', () => {
      expect(severityFromAtencaoNivel('ATENCAO')).toBe('ATENCAO');
    });

    it('deve retornar INFO para nivelAtencao NORMAL ou ausente', () => {
      expect(severityFromAtencaoNivel('NORMAL')).toBe('INFO');
      expect(severityFromAtencaoNivel(undefined)).toBe('INFO');
    });
  });

  describe('severityFromReajusteRadarNivel', () => {
    it('mapeia VENCIDA -> CRITICA, HOJE/URGENTE -> URGENTE, PROXIMA -> ATENCAO', () => {
      expect(severityFromReajusteRadarNivel('VENCIDA')).toBe('CRITICA');
      expect(severityFromReajusteRadarNivel('HOJE')).toBe('URGENTE');
      expect(severityFromReajusteRadarNivel('URGENTE')).toBe('URGENTE');
      expect(severityFromReajusteRadarNivel('PROXIMA')).toBe('ATENCAO');
    });
  });

  describe('severityFromPaymentAlertNivel', () => {
    it('mapeia CRITICO -> CRITICA, ATENCAO -> ATENCAO, ACOMPANHAMENTO/NORMAL -> INFO', () => {
      expect(severityFromPaymentAlertNivel('CRITICO')).toBe('CRITICA');
      expect(severityFromPaymentAlertNivel('ATENCAO')).toBe('ATENCAO');
      expect(severityFromPaymentAlertNivel('ACOMPANHAMENTO')).toBe('INFO');
      expect(severityFromPaymentAlertNivel('NORMAL')).toBe('INFO');
    });
  });

  describe('severityFromPaymentStatusPrazo', () => {
    it('mapeia VENCIDO -> CRITICA, CRITICO -> URGENTE, ATENCAO -> ATENCAO, NORMAL/ausente -> INFO', () => {
      expect(severityFromPaymentStatusPrazo('VENCIDO')).toBe('CRITICA');
      expect(severityFromPaymentStatusPrazo('CRITICO')).toBe('URGENTE');
      expect(severityFromPaymentStatusPrazo('ATENCAO')).toBe('ATENCAO');
      expect(severityFromPaymentStatusPrazo('NORMAL')).toBe('INFO');
      expect(severityFromPaymentStatusPrazo(undefined)).toBe('INFO');
    });
  });

  describe('severityFromAttentionPriorityLevel', () => {
    it('mapeia os 5 níveis de AttentionPriorityLevel para a severidade canônica', () => {
      expect(severityFromAttentionPriorityLevel('VENCIDA')).toBe('CRITICA');
      expect(severityFromAttentionPriorityLevel('HOJE')).toBe('URGENTE');
      expect(severityFromAttentionPriorityLevel('URGENTE')).toBe('URGENTE');
      expect(severityFromAttentionPriorityLevel('PROXIMA')).toBe('ATENCAO');
      expect(severityFromAttentionPriorityLevel('SEM_PRAZO')).toBe('INFO');
    });
  });
});
