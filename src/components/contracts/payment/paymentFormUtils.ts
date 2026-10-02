import { addBusinessDays, formatDateISO, parseDateBRT } from '../../../services/temporalEngineService';
import { PAGAMENTO_RULES } from '../../../config/alertRules';

/** Máscara de moeda BR em tempo real: cada dígito digitado é tratado como centavo (ex.: 150000 -> 1.500,00). */
export function formatCurrencyInputBR(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const cents = parseInt(digits, 10);
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Converte "1.500,00" em número; vazio ou inválido vira undefined. */
export function parseCurrencyInputBR(display: string): number | undefined {
  if (!display.trim()) return undefined;
  const n = parseFloat(display.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Máscara de data dd/mm/aaaa digitada como texto livre (sem depender do seletor
 * nativo de calendário do navegador, que em alguns ambientes não permite
 * escolher o dia). Insere as barras automaticamente conforme os dígitos.
 */
export function maskDateInputBR(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  return [day, month, year].filter(Boolean).join('/');
}

/** Converte dd/mm/aaaa (completo) para yyyy-mm-dd; retorna '' se incompleta. */
export function parseDateInputBR(display: string): string {
  const digits = display.replace(/\D/g, '');
  if (digits.length !== 8) return '';
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  return `${year}-${month}-${day}`;
}

/** yyyy-mm-dd -> dd/mm/aaaa (vazio se não houver data). */
export function isoToBR(iso?: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('T')[0].split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

export function todayISO(): string {
  return formatDateISO(new Date());
}

export type PrazoEtapaPadrao = 'CONFERENCIA' | 'ENVIO' | 'COBRANCA_CGOFI';

/** Data-alvo padrão de uma etapa, a partir de uma data (usa os dias úteis de Regras de Alertas). */
export function prazoPadraoISO(etapa: PrazoEtapaPadrao, aPartirDeISO: string): string {
  const base = parseDateBRT(aPartirDeISO) || new Date();
  const dias =
    etapa === 'CONFERENCIA'
      ? PAGAMENTO_RULES.conferirPadraoDiasUteis
      : etapa === 'ENVIO'
        ? PAGAMENTO_RULES.enviarPadraoDiasUteis
        : PAGAMENTO_RULES.cgofiSemRespostaAcimaDeDiasUteis;
  return formatDateISO(addBusinessDays(base, dias));
}

/**
 * Só o prazo escolhido além do padrão (Regras de Alertas) exige justificativa. Terminar antes, ou no padrão,
 * não pede nada; o vencimento da fatura é acompanhado pelos alertas, não pelo formulário.
 * Mesma regra que o servidor aplica: a justificativa é obrigatória, não um aviso.
 */
export function prazoExigeJustificativa(params: { prazoISO: string; padraoISO: string }): boolean {
  const { prazoISO, padraoISO } = params;
  return Boolean(prazoISO && padraoISO && prazoISO > padraoISO);
}
