import { useCallback } from 'react';
import { useLocation, useNavigate, type NavigateOptions } from 'react-router-dom';

/**
 * Origem de uma tela de detalhe (Ata 360, Item, Contrato 360): a página de onde o usuário veio,
 * com os filtros da URL. `up` guarda a origem da própria origem, para o Voltar funcionar em cadeia
 * (Pagamentos → Contrato → Ata → Item → volta Ata → volta Contrato → volta Pagamentos).
 * Viaja no `state` da navegação, então sobrevive a recarregar a página, mas não a um link colado.
 */
export interface DetailOrigin {
  path: string;
  up?: DetailOrigin;
}

interface OriginState {
  origin?: DetailOrigin;
}

// Pedido 360 (Emendas): pelo número (parlamentar, ano e ordem) ou, sem número, pelo identificador interno.
// Parlamentar 360 (e o Pedido 360 abaixo dele) e o Pedido 360 sem número, pelo identificador interno.
const DETAIL_PATH = /^\/(atas\/detalhe\/|contratos\/[^/]|emendas\/parlamentares\/[^/?#]|emendas\/pedidos\/id\/|emendas\/emendas\/[^/?#])/;

/** Telas de detalhe: só elas recebem a origem. */
export function isDetailPath(to: string): boolean {
  return DETAIL_PATH.test(to.split(/[?#]/)[0]);
}

/** Nome do destino do Voltar ("Voltar para …") a partir do endereço de origem; nulo se a origem não é uma tela conhecida. */
export function originLabel(path: string): string | null {
  const pathname = path.split(/[?#]/)[0];
  switch (pathname) {
    case '/instrumentos': return 'Início';
    case '/atas': return 'Carteira';
    case '/contratos': return 'Carteira';
    case '/itens': return 'Carteira';
    case '/atas/distribuicao': return 'Distribuição';
    case '/pagamentos': return 'Pagamentos';
    case '/empenhos': return 'Empenhos';
    case '/emendas/inicio': return 'Início';
    case '/emendas/pedidos': return 'Pedidos';
    case '/emendas/parlamentares': return 'Parlamentares';
    case '/emendas/emendas': return 'Emendas';
    default: break;
  }
  if (/^\/atas\/detalhe\/[^/]+\/itens\/[^/]+/.test(pathname)) return 'o item';
  if (/^\/atas\/detalhe\/[^/]+/.test(pathname)) return 'a ata';
  if (/^\/contratos\/[^/]+/.test(pathname)) return 'o contrato';
  if (/^\/emendas\/(parlamentares\/[^/]+\/pedidos|pedidos\/id)\/[^/]+/.test(pathname)) return 'o pedido';
  if (/^\/emendas\/parlamentares\/[^/]+/.test(pathname)) return 'o parlamentar';
  if (/^\/emendas\/emendas\/[^/]+\/[^/]+/.test(pathname)) return 'a emenda';
  return null;
}

function readOrigin(state: unknown): DetailOrigin | undefined {
  const origin = (state as OriginState | null | undefined)?.origin;
  return origin && typeof origin.path === 'string' ? origin : undefined;
}

/** `navigate` que, ao abrir uma tela de detalhe, registra a página atual (com filtros) como origem. */
export function useNavigateWithOrigin() {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (to: string, options?: NavigateOptions) => {
      if (!isDetailPath(to)) return navigate(to, options);
      const origin: DetailOrigin = { path: `${location.pathname}${location.search}`, up: readOrigin(location.state) };
      return navigate(to, { ...options, state: { ...(options?.state as object | undefined), origin } });
    },
    [navigate, location.pathname, location.search, location.state]
  );
}

/**
 * Destino do botão Voltar de uma tela de detalhe: a origem registrada ao abrir a tela; sem ela
 * (link direto, ou origem desconhecida), a lista padrão. `label` já vem como "Voltar para …".
 */
export function useBackTarget(fallback: { path: string; label: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const origin = readOrigin(location.state);
  const originName = origin ? originLabel(origin.path) : null;

  // Estado da própria origem: quem sobe de nível (ex.: do item para a ata) herda a origem de quem veio antes.
  const upState: OriginState | undefined = origin?.up ? { origin: origin.up } : undefined;

  const back = useCallback(() => {
    if (origin && originName) navigate(origin.path, { state: upState });
    else navigate(fallback.path);
  }, [navigate, origin, originName, upState, fallback.path]);

  return { label: origin && originName ? `Voltar para ${originName}` : fallback.label, back, upState };
}
