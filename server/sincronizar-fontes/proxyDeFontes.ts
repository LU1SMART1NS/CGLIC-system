/**
 * No navegador, os serviços de sincronização chamam as fontes oficiais por endereços relativos
 * (/api-arp, /api-pncp, /api-contratos-gov, /api-sta) que o Vite (desenvolvimento) e a Vercel (produção) repassam aos
 * servidores do governo, por causa do CORS. No servidor não há CORS nem proxy: este módulo traduz esses
 * endereços para os reais, os mesmos de vite.config.ts e vercel.json.
 */

export const DESTINOS_DAS_FONTES: ReadonlyArray<readonly [prefixo: string, destino: string]> = [
  ['/api-arp/', 'https://dadosabertos.compras.gov.br/'],
  ['/api-pncp/', 'https://pncp.gov.br/'],
  ['/api-contratos-gov/', 'https://contratos.comprasnet.gov.br/'],
  // Tesouro Nacional (STA): ordens bancárias por documento de origem (NP)
  ['/api-sta/', 'https://sta.api.gov.br/']
];

/** Identificação honesta do robô nas fontes oficiais. */
export const USER_AGENT_DA_SINCRONIZACAO = 'CGLIC-SaldoARP/1.0 (sincronizacao automatica; cglic.vercel.app)';

/** Endereço real de uma chamada a uma fonte; endereços que não são das fontes passam como vieram. */
export function resolverUrlDaFonte(url: string): string {
  for (const [prefixo, destino] of DESTINOS_DAS_FONTES) {
    if (url.startsWith(prefixo)) return destino + url.slice(prefixo.length);
  }
  return url;
}

type Fetch = typeof fetch;

/**
 * Tempo máximo de uma chamada a uma fonte. Sem isso, uma conexão que a fonte deixa pendurada (PNCP e
 * Compras.gov.br fazem isso de vez em quando) segura a execução até a Edge Function ser derrubada pelo
 * limite de 150 s, e a trava da sincronização fica presa por 10 minutos sem nada gravado (08/10/2026).
 * Com o limite, a chamada falha como falha de rede: a sincronização tenta de novo e, se não der, conclui
 * com a falha registrada e a trava liberada.
 */
export const TEMPO_LIMITE_FONTE_MS = 30_000;

/**
 * Troca o `fetch` global por um que traduz os endereços das fontes, se identifica e limita o tempo de cada
 * chamada (quando o chamador não trouxe o próprio sinal de cancelamento). Devolve a função que restaura o
 * original (usada nos testes).
 */
export function instalarProxyDeFontes(
  alvo: { fetch: Fetch } = globalThis as unknown as { fetch: Fetch },
  tempoLimiteMs: number = TEMPO_LIMITE_FONTE_MS
): () => void {
  const original = alvo.fetch;
  alvo.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    if (typeof entrada !== 'string') return original(entrada, init);
    const url = resolverUrlDaFonte(entrada);
    if (url === entrada) return original(entrada, init);
    const cabecalhos = new Headers(init?.headers);
    if (!cabecalhos.has('user-agent')) cabecalhos.set('user-agent', USER_AGENT_DA_SINCRONIZACAO);
    if (!cabecalhos.has('accept')) cabecalhos.set('accept', 'application/json');
    const signal = init?.signal ?? AbortSignal.timeout(tempoLimiteMs);
    try {
      return await original(url, { ...init, headers: cabecalhos, signal });
    } catch (err) {
      // TypeError é o que o fetch lança em falha de rede: a sincronização trata igual (nova tentativa).
      if ((err as { name?: string })?.name === 'TimeoutError') {
        throw new TypeError(`A fonte não respondeu em ${Math.round(tempoLimiteMs / 1000)} s: ${url}`);
      }
      throw err;
    }
  }) as Fetch;
  return () => {
    alvo.fetch = original;
  };
}
