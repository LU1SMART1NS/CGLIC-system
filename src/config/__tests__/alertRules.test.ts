import { describe, it, expect } from 'vitest';
import {
  SALDO_RULES,
  TAREFA_RULES,
  VIGENCIA_RULES,
  PAGAMENTO_RULES,
  classifyTarefaPrazo,
  isLembreteNaJanela
} from '../alertRules';

describe('alertRules — padrões do sistema', () => {
  it('mantém os valores vigentes das réguas (mudar um número aqui muda o sistema inteiro)', () => {
    expect(SALDO_RULES).toEqual({ criticoAcimaDePct: 80, atencaoAcimaDePct: 50, esgotadoAPartirDePct: 100 });
    expect(TAREFA_RULES).toEqual({ urgenteAteDias: 7, atencaoAteDias: 30 });
    expect(VIGENCIA_RULES.lembreteJanelaDias).toEqual({ contrato: 60, ata: 90 });
    expect(VIGENCIA_RULES.gatilhoDias.contratoProrrogacao).toBe(180);
    expect(PAGAMENTO_RULES.criticoAteDiasUteis).toBe(3);
  });

  it('as faixas fazem sentido: atenção sempre depois do crítico', () => {
    expect(SALDO_RULES.atencaoAcimaDePct).toBeLessThan(SALDO_RULES.criticoAcimaDePct);
    expect(SALDO_RULES.criticoAcimaDePct).toBeLessThan(SALDO_RULES.esgotadoAPartirDePct);
    expect(TAREFA_RULES.urgenteAteDias).toBeLessThan(TAREFA_RULES.atencaoAteDias);
    expect(VIGENCIA_RULES.faixaCriticoAteDias).toBeLessThan(VIGENCIA_RULES.faixaIntermediariaDias);
    expect(VIGENCIA_RULES.faixaIntermediariaDias).toBeLessThan(VIGENCIA_RULES.faixaAtencaoAteDias);
    expect(PAGAMENTO_RULES.criticoAteDiasUteis).toBeLessThan(PAGAMENTO_RULES.atencaoAteDiasUteis);
  });
});

describe('classifyTarefaPrazo', () => {
  it('classifica pelos dias até o prazo', () => {
    expect(classifyTarefaPrazo(-1)).toBe('VENCIDA');
    expect(classifyTarefaPrazo(0)).toBe('URGENTE');
    expect(classifyTarefaPrazo(7)).toBe('URGENTE');
    expect(classifyTarefaPrazo(8)).toBe('PROXIMA');
    expect(classifyTarefaPrazo(30)).toBe('PROXIMA');
    expect(classifyTarefaPrazo(31)).toBe('DISTANTE');
  });
});

describe('isLembreteNaJanela', () => {
  it('contrato 60 dias, ata 90 dias, atrasado sempre entra', () => {
    expect(isLembreteNaJanela({ diasRestantes: 60, atrasado: false, isAta: false })).toBe(true);
    expect(isLembreteNaJanela({ diasRestantes: 61, atrasado: false, isAta: false })).toBe(false);
    expect(isLembreteNaJanela({ diasRestantes: 90, atrasado: false, isAta: true })).toBe(true);
    expect(isLembreteNaJanela({ diasRestantes: 91, atrasado: false, isAta: true })).toBe(false);
    expect(isLembreteNaJanela({ diasRestantes: -5, atrasado: false, isAta: true })).toBe(false);
    expect(isLembreteNaJanela({ diasRestantes: -5, atrasado: true, isAta: true })).toBe(true);
  });
});

import {
  ALERT_RULE_DEFAULTS,
  ALERT_RULE_DEFINITIONS,
  applyAlertRuleOverrides,
  getAlertRuleValues,
  validateAlertRuleValues
} from '../alertRules';
import { classifyArpItemSaldo } from '../../services/balanceService';
import { classifyPrazo } from '../../components/carteira/carteiraPrazo';
import { REGRAS_OPERACIONAIS_PADRAO } from '../../services/temporalEngineService';
import { afterEach } from 'vitest';

describe('parametrização das regras', () => {
  afterEach(() => applyAlertRuleOverrides({}));

  it('toda definição aponta para um número real e os padrões batem com o código', () => {
    for (const def of ALERT_RULE_DEFINITIONS) {
      expect(typeof ALERT_RULE_DEFAULTS[def.key]).toBe('number');
      expect(ALERT_RULE_DEFAULTS[def.key]).toBeGreaterThanOrEqual(def.min);
      expect(ALERT_RULE_DEFAULTS[def.key]).toBeLessThanOrEqual(def.max);
    }
    expect(validateAlertRuleValues(getAlertRuleValues())).toEqual({});
  });

  it('sobrepor um valor muda a classificação em quem consome a régua; limpar volta ao padrão', () => {
    expect(classifyArpItemSaldo(75).isCritico).toBe(false);
    applyAlertRuleOverrides({ 'saldo.criticoAcimaDePct': 70 });
    expect(classifyArpItemSaldo(75).isCritico).toBe(true);
    expect(classifyPrazo(45)).toBe('ATENCAO');
    applyAlertRuleOverrides({ 'vigencia.faixaCriticoAteDias': 60 });
    expect(classifyPrazo(45)).toBe('CRITICO');
    expect(REGRAS_OPERACIONAIS_PADRAO.ARP_VIGENCIA_90D.offsetDias).toBe(-90);
    applyAlertRuleOverrides({ 'vigencia.gatilhoDias.arpExaustao': 120 });
    expect(REGRAS_OPERACIONAIS_PADRAO.ARP_VIGENCIA_90D.offsetDias).toBe(-120);
    applyAlertRuleOverrides({});
    expect(classifyArpItemSaldo(75).isCritico).toBe(false);
    expect(classifyPrazo(45)).toBe('ATENCAO');
    expect(REGRAS_OPERACIONAIS_PADRAO.ARP_VIGENCIA_90D.offsetDias).toBe(-90);
  });

  it('os textos acompanham o valor em vigor', () => {
    expect(REGRAS_OPERACIONAIS_PADRAO.ARP_VIGENCIA_90D.nome).toContain('(90d)');
    applyAlertRuleOverrides({ 'vigencia.gatilhoDias.arpExaustao': 120, 'vigencia.respostaFornecedorDiasUteis': 15 });
    expect(REGRAS_OPERACIONAIS_PADRAO.ARP_VIGENCIA_90D.nome).toContain('(120d)');
    expect(REGRAS_OPERACIONAIS_PADRAO.RESPOSTA_FORNECEDOR_10DU.nome).toContain('15 dias úteis');
  });

  it('ignora chaves desconhecidas e valores que não são número', () => {
    applyAlertRuleOverrides({ 'nao.existe': 5, 'saldo.criticoAcimaDePct': 'abc' });
    expect(getAlertRuleValues()['saldo.criticoAcimaDePct']).toBe(80);
  });

  it('valida limites e coerência entre faixas', () => {
    const base = getAlertRuleValues();
    const errors = validateAlertRuleValues({
      ...base,
      'saldo.atencaoAcimaDePct': 90,
      'tarefa.urgenteAteDias': 40,
      'pagamento.criticoAteDiasUteis': -1,
      'vigencia.faixaCriticoAteDias': 12.5
    });
    expect(errors['saldo.criticoAcimaDePct']).toMatch(/maior que o de atenção/);
    expect(errors['tarefa.atencaoAteDias']).toMatch(/maior que o urgente/);
    expect(errors['pagamento.criticoAteDiasUteis']).toMatch(/entre/);
    expect(errors['vigencia.faixaCriticoAteDias']).toMatch(/inteiro/);
  });
});

import { formatStatusVigencia } from '../../utils/statusVigencia';

describe('formatStatusVigencia', () => {
  afterEach(() => applyAlertRuleOverrides({}));

  it('"A Vencer" mostra a janela em vigor e os demais status passam direto', () => {
    expect(formatStatusVigencia('A Vencer')).toBe('A Vencer (60d)');
    applyAlertRuleOverrides({ 'vigencia.aVencerAteDias': 90 });
    expect(formatStatusVigencia('A Vencer')).toBe('A Vencer (90d)');
    expect(formatStatusVigencia('Expirado')).toBe('Expirado');
    expect(formatStatusVigencia(undefined)).toBe('Vigente');
  });
});
