import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertRulesPage } from '../AlertRulesPage';
import { ALERT_RULE_DEFINITIONS, ALERT_RULE_GROUPS } from '../../../config/alertRules';
import { toSettingsPayload } from '../../../services/alertSettingsService';
import { ALERT_RULE_DEFAULTS } from '../../../config/alertRules';

describe('AlertRulesPage', () => {
  const html = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <AlertRulesPage />
    </QueryClientProvider>
  );

  it('mostra todos os grupos e um campo para cada regra editável', () => {
    expect(html).toContain('Regras de Alertas');
    for (const group of ALERT_RULE_GROUPS) expect(html).toContain(group.label);
    for (const def of ALERT_RULE_DEFINITIONS) expect(html).toContain(`data-testid="rule-${def.key}"`);
  });

  it('mostra as regras legais só como leitura, sem campo de edição', () => {
    expect(html).toContain('Regras legais (somente leitura)');
    expect(html).toContain('Decreto 11.462/2023');
    expect(html).not.toContain('rule-adesao');
  });

  it('abre com Salvar desabilitado (nada alterado)', () => {
    const tag = html.match(/<button[^>]*data-testid="alert-rules-save"[^>]*>/)?.[0] ?? '';
    expect(tag).toContain('disabled');
  });
});

describe('toSettingsPayload', () => {
  it('manda null para o que voltou ao padrão e o número para o que foi alterado', () => {
    const payload = toSettingsPayload({ ...ALERT_RULE_DEFAULTS, 'saldo.criticoAcimaDePct': 75 });
    expect(payload['saldo.criticoAcimaDePct']).toBe(75);
    expect(payload['tarefa.urgenteAteDias']).toBeNull();
  });
});
