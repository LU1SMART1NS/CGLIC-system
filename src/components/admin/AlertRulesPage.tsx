import React from 'react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { BellRing, Scale } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../design-system/components/PageHeader';
import { ActionButton } from '../../design-system/components/ActionButton';
import { useConfirmDialog, useToast } from '../../design-system';
import {
  ALERT_RULE_DEFAULTS,
  ALERT_RULE_DEFINITIONS,
  ALERT_RULE_GROUPS,
  getAlertRuleValues,
  validateAlertRuleValues
} from '../../config/alertRules';
import { saveAlertSettings } from '../../services/alertSettingsService';
import { DataTable } from '../../design-system/components/DataTable';
import { AdminListShell } from './shared/AdminListShell';
import { LimitesArt75Card } from './LimitesArt75Card';

/** Limites que vêm de lei ou decreto: aparecem só como referência, nunca editáveis. */
const LEGAL_RULES: Array<{ label: string; value: string; source: string }> = [
  { label: 'Limite de adesões (caronas) por item', value: '2x o quantitativo registrado', source: 'Lei 14.133/2021 e Decreto 11.462/2023' },
  { label: 'Acréscimos e supressões contratuais', value: 'até 25% (50% em reforma)', source: 'Lei 14.133/2021, art. 125' },
  { label: 'Acréscimo de quantitativo em Ata', value: 'vedado', source: 'Decreto 11.462/2023, art. 23' },
  { label: 'Aditivo de prorrogação após o fim da vigência', value: 'nulo de pleno direito', source: 'Lei 14.133/2021' }
];

const inputStyle: React.CSSProperties = {
  width: '96px',
  padding: '0.4rem 0.55rem',
  fontWeight: 700,
  color: '#0f172a',
  textAlign: 'right'
};

export const AlertRulesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirmDialog();

  const [saved, setSaved] = React.useState<Record<string, number>>(() => getAlertRuleValues());
  const [draft, setDraft] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(getAlertRuleValues()).map(([k, v]) => [k, String(v)]))
  );
  const [isSaving, setIsSaving] = React.useState(false);

  const parsed = React.useMemo(
    () => Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim() === '' ? NaN : Number(v)])) as Record<string, number>,
    [draft]
  );
  const errors = React.useMemo(() => validateAlertRuleValues(parsed), [parsed]);
  const changedKeys = ALERT_RULE_DEFINITIONS.filter((d) => parsed[d.key] !== saved[d.key]).map((d) => d.key);
  const hasErrors = Object.keys(errors).length > 0;
  const differsFromDefault = ALERT_RULE_DEFINITIONS.filter((d) => parsed[d.key] !== ALERT_RULE_DEFAULTS[d.key]).length;

  const setValue = (key: string, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));
  const resetToDefaults = (keys: string[]) =>
    setDraft((prev) => ({ ...prev, ...Object.fromEntries(keys.map((k) => [k, String(ALERT_RULE_DEFAULTS[k])])) }));

  const handleSave = async () => {
    if (hasErrors || changedKeys.length === 0) return;
    const ok = await confirm({
      title: 'Salvar regras de alertas',
      message: `${changedKeys.length} ${changedKeys.length === 1 ? 'regra será alterada' : 'regras serão alteradas'} para todos os usuários. Os alertas de todo o sistema serão recalculados com os novos valores (cada usuário recebe a mudança ao recarregar a página). Deseja continuar?`,
      confirmLabel: 'Salvar'
    });
    if (!ok) return;
    setIsSaving(true);
    try {
      await saveAlertSettings(parsed);
      setSaved(getAlertRuleValues());
      await queryClient.invalidateQueries();
      toast.success('Regras de alertas salvas.');
    } catch (err: any) {
      toast.error(`Não foi possível salvar: ${err?.message || 'erro desconhecido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Regras de Alertas"
        subtitle="Limites que classificam os alertas em todas as telas."
        icon={<BellRing size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <>
            <ActionButton
              action="restaurar"
              label="Restaurar padrão"
              onClick={() => resetToDefaults(ALERT_RULE_DEFINITIONS.map((d) => d.key))}
              disabled={differsFromDefault === 0 || isSaving}
              data-testid="alert-rules-reset-all"
            />
            <ActionButton
              action="salvar"
              onClick={handleSave}
              disabled={hasErrors || changedKeys.length === 0 || isSaving}
              isLoading={isSaving}
              data-testid="alert-rules-save"
            >
              Salvar{changedKeys.length > 0 ? ` (${changedKeys.length})` : ''}
            </ActionButton>
          </>
        }
      />

      {ALERT_RULE_GROUPS.map((group) => {
        const defs = ALERT_RULE_DEFINITIONS.filter((d) => d.group === group.id);
        return (
          <AdminListShell key={group.id} testId={`alert-rules-group-${group.id}`} title={group.label} description={group.description}>
            <DataTable<(typeof defs)[number]>
              testId={`alert-rules-table-${group.id}`}
              className="data-table-container--flush"
              data={defs}
              keyExtractor={(d) => d.key}
              columns={[
                {
                  key: 'regra',
                  header: 'Regra',
                  priority: 'primary',
                  render: (def) => {
                    const error = errors[def.key];
                    return (
                      <>
                        <label htmlFor={`rule-${def.key}`} style={{ fontWeight: 700, color: '#0f172a' }}>{def.label}</label>
                        {def.hint && <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>{def.hint}</div>}
                        {error && (
                          <div role="alert" style={{ fontSize: '0.76rem', color: 'var(--color-danger-text)', marginTop: '2px', fontWeight: 600 }}>{error}</div>
                        )}
                      </>
                    );
                  }
                },
                {
                  key: 'valor',
                  header: 'Valor',
                  width: '220px',
                  render: (def) => {
                    const error = errors[def.key];
                    const isChanged = parsed[def.key] !== saved[def.key];
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          id={`rule-${def.key}`}
                          type="number"
                          inputMode="numeric"
                          value={draft[def.key]}
                          min={def.min}
                          max={def.max}
                          onChange={(e) => setValue(def.key, e.target.value)}
                          aria-invalid={Boolean(error)}
                          data-testid={`rule-${def.key}`}
                          className="ds-field__control"
                          style={{
                            ...inputStyle,
                            borderColor: error ? 'var(--color-danger)' : isChanged ? 'var(--primary)' : undefined,
                            background: isChanged ? 'var(--color-info-bg)' : undefined
                          }}
                        />
                        <span style={{ fontSize: '0.8rem', color: '#475569' }}>{def.unit}</span>
                      </div>
                    );
                  }
                },
                {
                  key: 'padrao',
                  header: 'Padrão',
                  width: '110px',
                  render: (def) => <span style={{ color: '#64748b' }}>{ALERT_RULE_DEFAULTS[def.key]} {def.unit}</span>
                }
              ]}
              rowActions={(def) => {
                const isDefault = parsed[def.key] === ALERT_RULE_DEFAULTS[def.key];
                return (
                  <ActionButton
                    action="restaurar"
                    iconOnly
                    label={`Voltar ao padrão: ${def.label}`}
                    title="Voltar ao padrão"
                    onClick={() => resetToDefaults([def.key])}
                    disabled={isDefault || isSaving}
                  />
                );
              }}
            />
          </AdminListShell>
        );
      })}

      <AdminListShell
        testId="alert-rules-legal"
        title="Regras legais (somente leitura)"
        description="Vêm de lei ou decreto e não podem ser alteradas aqui."
        icon={<Scale size={16} color="#334155" aria-hidden="true" />}
      >
        <DataTable<(typeof LEGAL_RULES)[number]>
          testId="alert-rules-legal-table"
          className="data-table-container--flush"
          data={LEGAL_RULES}
          keyExtractor={(r) => r.label}
          columns={[
            { key: 'label', header: 'Regra', priority: 'primary', render: (r) => <span style={{ fontWeight: 700 }}>{r.label}</span> },
            { key: 'value', header: 'Limite', render: (r) => r.value },
            { key: 'source', header: 'Fonte', render: (r) => <span style={{ color: '#64748b' }}>{r.source}</span> }
          ]}
        />
      </AdminListShell>

      <LimitesArt75Card />
    </PageContainer>
  );
};
