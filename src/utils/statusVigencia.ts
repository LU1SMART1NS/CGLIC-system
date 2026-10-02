import { VIGENCIA_RULES } from '../config/alertRules';

/** Valor interno do status "a vencer" do contrato (não carrega o número de dias). */
export const STATUS_A_VENCER = 'A Vencer' as const;

/** Texto exibido ao usuário: "A Vencer" ganha a janela em vigor (ex.: "A Vencer (60d)"). */
export function formatStatusVigencia(status?: string | null): string {
  if (!status) return 'Vigente';
  return status === STATUS_A_VENCER ? `${STATUS_A_VENCER} (${VIGENCIA_RULES.aVencerAteDias}d)` : status;
}
