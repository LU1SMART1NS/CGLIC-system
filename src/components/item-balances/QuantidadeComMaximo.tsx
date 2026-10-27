import React from 'react';
import { AppButton, AppInput } from '../../design-system';
import { formatNumber } from './itemBalanceUtils';

interface Props {
  rotulo: string;
  valor: string;
  onMudar: (v: string) => void;
  /** Máximo permitido agora; nulo enquanto não dá para saber (ex.: falta escolher o destino). */
  maximo: number | null;
  /** Verbo da frase do máximo: "Você pode remanejar no máximo 80." */
  verbo: string;
  /** Por que o máximo é esse, em uma frase. Aparece só quando a quantidade passa. */
  motivo?: string | null;
  testId: string;
  disabled?: boolean;
  /** Botão "Usar o máximo" (a janela de remanejar para não participante não tem: pedido do usuário em 27/10/2026). */
  comBotaoMaximo?: boolean;
}

/**
 * Quantidade com o máximo à vista (decisão D6 de 27/10/2026): uma frase só quando passa ("Você pode remanejar no
 * máximo X."), o motivo em poucas palavras e o botão "Usar o máximo". Vale nas janelas de remanejamento.
 */
export const QuantidadeComMaximo: React.FC<Props> = ({ rotulo, valor, onMudar, maximo, verbo, motivo, testId, disabled, comBotaoMaximo = true }) => {
  const qtd = /^\d+$/.test(valor) ? Number(valor) : 0;
  const passou = maximo != null && qtd > maximo;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600 }}>
        <span>
          {rotulo}
          {maximo != null && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · máximo {formatNumber(maximo)}</span>}
        </span>
        <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <AppInput
            inputMode="numeric"
            value={valor}
            style={{ width: 150, borderColor: passou ? 'var(--color-danger)' : undefined }}
            onChange={(e) => onMudar(e.target.value.replace(/\D/g, ''))}
            aria-label={maximo != null ? `${rotulo}, máximo ${formatNumber(maximo)}` : rotulo}
            aria-invalid={passou || undefined}
            disabled={disabled}
            data-testid={testId}
          />
          {comBotaoMaximo && maximo != null && maximo > 0 && qtd !== maximo && (
            <AppButton variant="secondary" size="sm" onClick={() => onMudar(String(maximo))} disabled={disabled} data-testid={`${testId}-maximo`}>
              Usar o máximo ({formatNumber(maximo)})
            </AppButton>
          )}
        </span>
      </label>
      {passou && (
        <div role="alert" data-testid={`${testId}-passou`} style={{ background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.84rem' }}>
          <b style={{ color: 'var(--color-danger-text)' }}>
            {maximo === 0 ? `Não dá para ${verbo} agora.` : `Você pode ${verbo} no máximo ${formatNumber(maximo!)}.`}
          </b>
          {motivo && <div style={{ marginTop: 2 }}>{motivo}</div>}
        </div>
      )}
    </div>
  );
};
