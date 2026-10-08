import React from 'react';
import { Info } from 'lucide-react';
import { IconButton } from './IconButton';
import { Tooltip } from './Tooltip';

export interface InfoHintProps {
  /** Explicação que antes ficava numa faixa fixa na tela. */
  content: string;
  /** Nome do botão para leitores de tela. */
  label?: string;
  testId?: string;
}

/**
 * Ícone ⓘ que abre a explicação sob demanda (hover, foco, toque). Use para regra ou definição que vale
 * sempre; faixa de aviso (NoticeBar) fica só para o que mudou de estado ou pede ação agora.
 */
export const InfoHint: React.FC<InfoHintProps> = ({ content, label = 'Mais informações', testId = 'info-hint' }) => (
  <span className="ds-infohint">
    <Tooltip content={content}>
      <IconButton label={label} title="" icon={<Info size={16} aria-hidden="true" />} className="ds-infohint__btn" data-testid={testId} />
    </Tooltip>
  </span>
);
