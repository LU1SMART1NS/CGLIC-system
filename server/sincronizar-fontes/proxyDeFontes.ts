/**
 * No navegador, os serviços de sincronização chamam as fontes oficiais por endereços relativos
 * (/api-arp, /api-pncp, /api-contratos-gov) que o Vite (desenvolvimento) e a Vercel (produção) repassam aos
 * servidores do governo, por causa do CORS. No servidor não há CORS nem proxy: este módulo traduz esses
 * endereços para os reais, os mesmos de vite.config.ts e vercel.json.
 */

export const DESTINOS_DAS_FONTES: ReadonlyArray<readonly [prefixo: string, destino: string]> = [
  ['/api-arp/', 'https://dadosabertos.compras.gov.br/'],
  ['/api-pncp/', 'https://pncp.gov.br/'],
  ['/api-contratos-gov/', 'https://contratos.comprasnet.gov.br/']
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
 * Troca o `fetch` global por um que traduz os endereços das fontes e se identifica. Devolve a função que
 * restaura o original (usada nos testes).
 */
export function instalarProxyDeFontes(alvo: { fetch: Fetch } = globalThis as unknown as { fetch: Fetch }): () => void {
  const original = alvo.fetch;
  alvo.fetch = ((entrada: RequestInfo | URL, init?: RequestInit) => {
    if (typeof entrada !== 'string') return original(entrada, init);
    const url = resolverUrlDaFonte(entrada);
    if (url === entrada) return original(entrada, init);
    const cabecalhos = new Headers(init?.headers);
    if (!cabecalhos.has('user-agent')) cabecalhos.set('user-agent', USER_AGENT_DA_SINCRONIZACAO);
    if (!cabecalhos.has('accept')) cabecalhos.set('accept', 'application/json');
    return original(url, { ...init, headers: cabecalhos });
  }) as Fetch;
  return () => {
    alvo.fetch = original;
  };
}
