import React from 'react';

/** Elementos que têm ação própria dentro da linha: o clique neles não abre o detalhe. */
const INTERATIVO = 'button, a, input, select, textarea, label, [role="menu"], [role="dialog"]';

/**
 * Clique em qualquer parte da linha abre o detalhe (padrão Jira/Linear), exceto em botões e links da própria
 * linha (filtro na célula, atribuir gestor, expandir) e quando o usuário está selecionando texto.
 */
export function abrirAoClicarNaLinha(abrir: () => void) {
  return (e: React.MouseEvent<HTMLElement>) => {
    const alvo = e.target as HTMLElement;
    if (alvo.closest(INTERATIVO)) return;
    if (window.getSelection?.()?.toString()) return;
    abrir();
  };
}

/** Número do instrumento: o link da linha para o teclado e o leitor de tela (a linha toda também abre). */
export const CarteiraIdLink: React.FC<{ onClick: () => void; label: string; title?: string; testId?: string; children: React.ReactNode }> = ({
  onClick,
  label,
  title,
  testId,
  children
}) => (
  <button
    type="button"
    className="carteira-id-link"
    onClick={onClick}
    aria-label={label}
    title={title}
    data-testid={testId}
    style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 800, color: '#0c326f', cursor: 'pointer', textAlign: 'left' }}
  >
    {children}
  </button>
);
