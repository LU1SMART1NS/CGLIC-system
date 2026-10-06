import React from 'react';
import { ChevronRight } from 'lucide-react';

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
    style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 800, color: 'var(--primary)', cursor: 'pointer', textAlign: 'left' }}
  >
    {children}
  </button>
);

/**
 * Linha de LISTA (cartões empilhados, como a fila de Ações) que leva a outra tela: a linha toda é o clique, com mão,
 * realce ao passar o mouse e a seta (SetaDaLinha) à direita. Devolve as props para espalhar no elemento da linha;
 * sem destino (`abrir` nulo) devolve vazio e a linha segue sem clique.
 * - `teclado: 'linha'` (padrão): a própria linha é um botão (Tab e Enter). Use quando não há botões dentro dela.
 * - `teclado: 'link'`: a linha só responde ao mouse; quem usa teclado chega pelo número do instrumento
 *   (CarteiraIdLink). Use quando a linha tem botões próprios (desvincular), para não aninhar botão em botão.
 */
export function propsDeLinhaClicavel(
  abrir: (() => void) | null | undefined,
  /** Dica ao passar o mouse (o que acontece ao clicar). */
  dica: string,
  opts: { teclado?: 'linha' | 'link'; /** Rótulo do leitor de tela; por padrão, a dica. */ rotulo?: string } = {}
): React.HTMLAttributes<HTMLElement> {
  if (!abrir) return {};
  const base: React.HTMLAttributes<HTMLElement> = {
    className: 'action-row--go',
    title: dica,
    onClick: abrirAoClicarNaLinha(abrir)
  };
  if (opts.teclado === 'link') return base;
  return {
    ...base,
    role: 'button',
    tabIndex: 0,
    'aria-label': opts.rotulo ?? dica,
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        abrir();
      }
    }
  };
}

/** Seta à direita da linha de lista clicável (só enfeite: o clique é da linha). */
export const SetaDaLinha: React.FC = () => (
  <span className="action-row__go" aria-hidden="true">
    <ChevronRight size={18} />
  </span>
);
