/**
 * `fetch` que desiste depois de um tempo limite, com mensagem legível em falha de rede ou de tempo. Módulo próprio
 * (fora de api.ts) para os leitores de itens do contrato usarem sem puxar a api inteira nos testes.
 */

/** Tempo máximo de espera pela lista de empenhos de um contrato (Contratos.gov.br e PNCP). */
export const TEMPO_LIMITE_EMPENHOS_MS = 30_000;
/** Tempo máximo de espera pela minuta de um empenho. */
export const TEMPO_LIMITE_DETALHE_EMPENHO_MS = 15_000;
/** Tempo máximo de espera pelos itens de um contrato (Contratos.gov.br e Compras.gov.br). */
export const TEMPO_LIMITE_ITENS_MS = 20_000;

/** Erro de uma consulta que não terminou no tempo limite. Quem chama pode tentar de novo. */
export class TempoEsgotadoError extends Error {
  constructor(fonte: string, ms: number) {
    super(`${fonte} não respondeu em ${Math.round(ms / 1000)} s.`);
    this.name = 'TempoEsgotadoError';
  }
}

export async function fetchComTempoLimite(url: string, ms: number, fonte: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (err: any) {
    if (controller.signal.aborted) throw new TempoEsgotadoError(fonte, ms);
    throw new Error(`Falha de rede ao consultar o ${fonte}: ${err?.message || err}`);
  } finally {
    clearTimeout(timer);
  }
}
