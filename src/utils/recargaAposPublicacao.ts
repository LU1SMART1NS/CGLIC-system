import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Cada tela é um arquivo próprio com nome que muda a cada publicação. Quem ficou com a aba aberta durante
 * uma publicação na Vercel guarda os nomes antigos; ao abrir outra tela, o navegador pede um arquivo que
 * não existe mais (404) e a tela não carrega. A saída é recarregar a página uma vez para pegar a versão nova.
 * A marca na sessionStorage impede recarregar em laço quando a falha é de outra natureza (rede fora do ar).
 */
const CHAVE = 'cglic:recarga-apos-publicacao';
const JANELA_MS = 30_000;

export function recarregarUmaVez(): boolean {
  try {
    const ultima = Number(sessionStorage.getItem(CHAVE) ?? 0);
    if (Date.now() - ultima < JANELA_MS) return false;
    sessionStorage.setItem(CHAVE, String(Date.now()));
  } catch {
    // sessionStorage bloqueado: sem a trava, não arrisca recarregar em laço.
    return false;
  }
  window.location.reload();
  return true;
}

export function importarComRecarga<M>(importar: () => Promise<M>): Promise<M> {
  return importar().catch((erro: unknown) => {
    // Enquanto a página recarrega, a promessa fica pendente: o Suspense segue mostrando "Carregando…".
    if (recarregarUmaVez()) return new Promise<never>(() => {});
    throw erro;
  });
}

/** Como o `lazy` do React, mas recarrega a página uma vez quando o arquivo da tela não é encontrado. */
export function lazyComRecarga<T extends ComponentType<any>>(
  importar: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(() => importarComRecarga(importar));
}

/** O Vite avisa quando falha ao pré-carregar um pedaço do app; a resposta é a mesma. */
export function ouvirFalhaDePreCarga(): void {
  window.addEventListener('vite:preloadError', (evento) => {
    if (recarregarUmaVez()) evento.preventDefault();
  });
}
