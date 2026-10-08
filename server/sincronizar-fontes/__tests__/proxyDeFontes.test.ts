import { describe, it, expect, vi } from 'vitest';
import { instalarProxyDeFontes, resolverUrlDaFonte, USER_AGENT_DA_SINCRONIZACAO } from '../proxyDeFontes';

describe('resolverUrlDaFonte — mesmos destinos do vite.config.ts e do vercel.json', () => {
  it.each([
    ['/api-arp/modulo-arp/1_consultarARP?pagina=1', 'https://dadosabertos.compras.gov.br/modulo-arp/1_consultarARP?pagina=1'],
    ['/api-pncp/api/pncp/v1/orgaos/1/compras/2025/1', 'https://pncp.gov.br/api/pncp/v1/orgaos/1/compras/2025/1'],
    ['/api-contratos-gov/api/contrato/ug/200331', 'https://contratos.comprasnet.gov.br/api/contrato/ug/200331']
  ])('%s', (entrada, esperado) => {
    expect(resolverUrlDaFonte(entrada)).toBe(esperado);
  });

  it('endereço que não é de fonte passa como veio', () => {
    expect(resolverUrlDaFonte('https://exemplo.com/x')).toBe('https://exemplo.com/x');
    expect(resolverUrlDaFonte('/outra-coisa/x')).toBe('/outra-coisa/x');
  });
});

describe('instalarProxyDeFontes', () => {
  function instalar() {
    const original = vi.fn(async () => new Response('{}'));
    const alvo = { fetch: original as unknown as typeof fetch };
    const restaurar = instalarProxyDeFontes(alvo);
    return { original, alvo, restaurar };
  }

  it('traduz o endereço, mantém o sinal de cancelamento e se identifica', async () => {
    const { original, alvo } = instalar();
    const controle = new AbortController();
    await alvo.fetch('/api-arp/modulo-arp/x', { signal: controle.signal });
    const [url, init] = original.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://dadosabertos.compras.gov.br/modulo-arp/x');
    expect(init.signal).toBe(controle.signal);
    const cabecalhos = new Headers(init.headers);
    expect(cabecalhos.get('user-agent')).toBe(USER_AGENT_DA_SINCRONIZACAO);
    expect(cabecalhos.get('accept')).toBe('application/json');
  });

  it('respeita cabeçalhos já definidos pelo chamador', async () => {
    const { original, alvo } = instalar();
    await alvo.fetch('/api-pncp/x', { headers: { accept: 'text/plain', 'user-agent': 'meu' } });
    const cabecalhos = new Headers((original.mock.calls[0] as unknown as [string, RequestInit])[1].headers);
    expect(cabecalhos.get('accept')).toBe('text/plain');
    expect(cabecalhos.get('user-agent')).toBe('meu');
  });

  it('chamadas que não são das fontes não são alteradas (nem ganham cabeçalhos)', async () => {
    const { original, alvo } = instalar();
    await alvo.fetch('https://bouutpmxexvwppcmmhdi.supabase.co/rest/v1/x', { method: 'POST' });
    expect(original).toHaveBeenCalledWith('https://bouutpmxexvwppcmmhdi.supabase.co/rest/v1/x', { method: 'POST' });
  });

  it('sem sinal do chamador, cada chamada a uma fonte ganha um tempo limite', async () => {
    const { original, alvo } = instalar();
    await alvo.fetch('/api-pncp/x');
    const [, init] = original.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  it('fonte que não responde no tempo: falha como falha de rede (TypeError), e não segura a execução', async () => {
    const pendurado = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    }));
    const alvo = { fetch: pendurado as unknown as typeof fetch };
    instalarProxyDeFontes(alvo, 20);
    await expect(alvo.fetch('/api-arp/modulo-arp/x')).rejects.toThrow(/não respondeu em 0 s.*dadosabertos\.compras\.gov\.br/);
    await expect(alvo.fetch('/api-arp/modulo-arp/x')).rejects.toBeInstanceOf(TypeError);
  });

  it('restaurar devolve o fetch original', () => {
    const { original, alvo, restaurar } = instalar();
    expect(alvo.fetch).not.toBe(original);
    restaurar();
    expect(alvo.fetch).toBe(original);
  });
});
