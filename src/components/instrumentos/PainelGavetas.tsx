import React from 'react';
import { ChevronDown } from 'lucide-react';
import { ActionButton } from '../../design-system/components/ActionButton';
import { InfoHint } from '../../design-system/components/InfoHint';

import { PAINEL_GAVETA_NOMES, type PainelGavetaId } from './painelGavetasConfig';

export type { PainelGavetaId } from './painelGavetasConfig';

export interface PainelBotaoGaveta {
  id: PainelGavetaId;
  /** Resumo que dá para ler sem abrir ("29 vencem em 30 dias"). */
  resumo?: React.ReactNode;
  /** Amarelo quando o resumo pede atenção. */
  atencao?: boolean;
}

/**
 * Botões das áreas do Início: cada um diz como está a área e abre a gaveta com o detalhe, uma por vez. Ficam
 * logo abaixo dos cartões e encolhem com eles; a faixa azul repete os botões.
 */
export const PainelBotoesGavetas: React.FC<{
  botoes: PainelBotaoGaveta[];
  aberta: PainelGavetaId | null;
  onToggle: (id: PainelGavetaId) => void;
}> = ({ botoes, aberta, onToggle }) => {
  if (botoes.length === 0) return null;
  return (
    <div className="pn-gavetas" role="group" aria-label="Áreas do painel" data-testid="painel-gavetas">
      <span className="pn-gavetas-lbl">Ver mais:</span>
      {botoes.map((b) => (
        <button
          key={b.id}
          type="button"
          className="pn-gaveta-btn"
          aria-expanded={aberta === b.id}
          aria-controls={`painel-gaveta-${b.id}`}
          onClick={() => onToggle(b.id)}
          data-testid={`painel-gaveta-btn-${b.id}`}
        >
          {PAINEL_GAVETA_NOMES[b.id]}
          {b.resumo != null && <span className={b.atencao ? 'pn-gaveta-resumo pn-gaveta-resumo--atencao' : 'pn-gaveta-resumo'}>{b.resumo}</span>}
          <ChevronDown size={16} className="pn-gaveta-seta" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
};

/**
 * Moldura da gaveta aberta: fica fora do bloco que encolhe, logo acima da lista, para continuar visível ao rolar.
 * `subtitulo` é uma frase de ação ("Clique na linha para abrir o item."); a regra fixa vai em `hint`, no ⓘ ao lado do nome.
 */
export const PainelGaveta: React.FC<{
  id: PainelGavetaId;
  subtitulo?: React.ReactNode;
  hint?: string;
  onFechar: () => void;
  children: React.ReactNode;
}> = ({ id, subtitulo, hint, onFechar, children }) => (
  <section id={`painel-gaveta-${id}`} className="pn-gaveta" aria-labelledby={`painel-gaveta-${id}-titulo`} data-testid={`painel-gaveta-${id}`}>
    <div className="pn-gaveta-head">
      <h2 id={`painel-gaveta-${id}-titulo`}>{PAINEL_GAVETA_NOMES[id]}</h2>
      {hint && <InfoHint content={hint} label={`Sobre ${PAINEL_GAVETA_NOMES[id]}`} testId={`painel-gaveta-hint-${id}`} />}
      {subtitulo && <span className="pn-gaveta-sub">{subtitulo}</span>}
      <ActionButton action="fechar" size="sm" onClick={onFechar} data-testid={`painel-gaveta-fechar-${id}`} />
    </div>
    {children}
  </section>
);
