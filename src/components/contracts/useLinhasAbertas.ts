import React from 'react';

/**
 * Linhas abertas de uma tabela com detalhes (DataTable com renderExpanded). `alvo` vem do endereço (`?abrir=`),
 * quando outra aba manda abrir uma linha: ela abre e a página rola até ela assim que os dados chegam.
 */
export function useLinhasAbertas(alvo: string | null | undefined, testIdTabela: string, prontas: boolean) {
  const [abertas, setAbertas] = React.useState<ReadonlySet<string>>(() => new Set());

  React.useEffect(() => {
    if (!alvo || !prontas) return;
    setAbertas((atual) => (atual.has(alvo) ? atual : new Set([...atual, alvo])));
    const rolar = () => {
      const linha = Array.from(document.querySelectorAll<HTMLElement>(`[data-testid^="${testIdTabela}-row-"]`)).find(
        (el) => el.dataset.testid === `${testIdTabela}-row-${alvo}`
      );
      linha?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    const id = window.setTimeout(rolar, 120);
    return () => window.clearTimeout(id);
  }, [alvo, prontas, testIdTabela]);

  const alternar = React.useCallback((key: string) => {
    setAbertas((atual) => {
      const prox = new Set(atual);
      if (prox.has(key)) prox.delete(key);
      else prox.add(key);
      return prox;
    });
  }, []);

  return { abertas, alternar };
}
