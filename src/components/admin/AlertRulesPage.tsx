import React from 'react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { BellRing, RotateCcw, Scale } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../design-system/components/PageHeader';
import { AppButton } from '../../design-system/components/AppButton';
import { useConfirmDialog, useToast } from '../../design-system';
import {
  ALERT_RULE_DEFAULTS,
  ALERT_RULE_DEFINITIONS,
  ALERT_RULE_GROUPS,
  getAlertRuleValues,
  validateAlertRuleValues
} from '../../config/alertRules';
import { saveAlertSettings } from '../../services/alertSettingsService';
import { carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';

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
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '0.88rem',
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

  const sectionStrip: React.CSSProperties = { padding: '0.6rem 1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' };

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Regras de Alertas"
        subtitle="Limites que classificam os alertas em todas as telas."
        icon={<BellRing size={26} color="#0c326f" aria-hidden="true" />}
        actions={
          <>
            <AppButton
              variant="outline"
              icon={<RotateCcw size={15} />}
              onClick={() => resetToDefaults(ALERT_RULE_DEFINITIONS.map((d) => d.key))}
              disabled={differsFromDefault === 0 || isSaving}
              data-testid="alert-rules-reset-all"
            >
              Restaurar padrão
            </AppButton>
            <AppButton
              onClick={handleSave}
              disabled={hasErrors || changedKeys.length === 0 || isSaving}
              isLoading={isSaving}
              data-testid="alert-rules-save"
            >
              Salvar{changedKeys.length > 0 ? ` (${changedKeys.length})` : ''}
            </AppButton>
          </>
        }
      />

      {ALERT_RULE_GROUPS.map((group) => {
        const defs = ALERT_RULE_DEFINITIONS.filter((d) => d.group === group.id);
        return (
          <div key={group.id} data-testid={`alert-rules-group-${group.id}`} style={carteiraTableShell}>
            <div style={sectionStrip}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>{group.label}</div>
              <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>{group.description}</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={carteiraTh}>Regra</th>
                    <th style={{ ...carteiraTh, width: '220px' }}>Valor</th>
                    <th style={{ ...carteiraTh, width: '110px' }}>Padrão</th>
                    <th style={{ ...carteiraTh, width: '70px', textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {defs.map((def) => {
                    const error = errors[def.key];
                    const isChanged = parsed[def.key] !== saved[def.key];
                    const isDefault = parsed[def.key] === ALERT_RULE_DEFAULTS[def.key];
                    return (
                      <tr key={def.key}>
                        <td style={carteiraTd}>
                          <label htmlFor={`rule-${def.key}`} style={{ fontWeight: 700, color: '#0f172a' }}>{def.label}</label>
                          {def.hint && <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>{def.hint}</div>}
                          {error && (
                            <div role="alert" style={{ fontSize: '0.76rem', color: '#b91c1c', marginTop: '2px', fontWeight: 600 }}>{error}</div>
                          )}
                        </td>
                        <td data-label="Valor" style={carteiraTd}>
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
                              style={{
                                ...inputStyle,
                                borderColor: error ? '#dc2626' : isChanged ? '#0c326f' : '#cbd5e1',
                                background: isChanged ? '#eff6ff' : '#ffffff'
                              }}
                            />
                            <span style={{ fontSize: '0.8rem', color: '#475569' }}>{def.unit}</span>
                          </div>
                        </td>
                        <td data-label="Padrão" style={{ ...carteiraTd, color: '#64748b' }}>{ALERT_RULE_DEFAULTS[def.key]} {def.unit}</td>
                        <td data-role="action" style={{ ...carteiraTd, textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => resetToDefaults([def.key])}
                            disabled={isDefault || isSaving}
                            title="Voltar ao padrão"
                            aria-label={`Voltar ao padrão: ${def.label}`}
                            style={{ background: 'none', border: 'none', padding: '0.2rem', display: 'inline-flex', cursor: isDefault || isSaving ? 'not-allowed' : 'pointer', color: isDefault ? '#cbd5e1' : '#0ea5e9' }}
                          >
                            <RotateCcw size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div data-testid="alert-rules-legal" style={carteiraTableShell}>
        <div style={{ ...sectionStrip, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Scale size={16} color="#334155" aria-hidden="true" />
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Regras legais (somente leitura)</div>
            <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>Vêm de lei ou decreto e não podem ser alteradas aqui.</div>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={carteiraTh}>Regra</th>
                <th style={carteiraTh}>Limite</th>
                <th style={carteiraTh}>Fonte</th>
              </tr>
            </thead>
            <tbody>
              {LEGAL_RULES.map((rule) => (
                <tr key={rule.label}>
                  <td style={{ ...carteiraTd, fontWeight: 700 }}>{rule.label}</td>
                  <td data-label="Limite" style={carteiraTd}>{rule.value}</td>
                  <td data-label="Fonte" style={{ ...carteiraTd, color: '#64748b' }}>{rule.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
};
