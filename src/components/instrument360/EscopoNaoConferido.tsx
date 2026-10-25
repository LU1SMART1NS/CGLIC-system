import React from 'react';
import { ActionButton } from '../../design-system';
import { Instrument360Page } from './Instrument360Page';
import { FontesComFalhaAviso } from '../fonte/FontesComFalhaAviso';
import { naoCarregou, useLeiturasComFalha, type LeituraDaTela } from '../fonte/useLeiturasComFalha';

/**
 * O perfil gestor só abre as telas 360 do que é dele, e isso se confere pelas leituras de gestores e vínculos
 * (useAssignedManagementScope). Se uma delas falhou sem leitura anterior, não dá para saber: em vez de "Acesso não
 * autorizado", a tela diz o que não carregou e deixa tentar de novo.
 */
export function escopoNaoConferido(isScopedRole: boolean, leituras: readonly LeituraDaTela[] | undefined): boolean {
  return isScopedRole && (leituras ?? []).some((l) => naoCarregou(l.query));
}

export const EscopoNaoConferido: React.FC<{
  leituras: readonly LeituraDaTela[];
  /** O que não deu para conferir, como frase: "esta ata está atribuída a você". */
  oQueConferir: string;
  backLabel?: string;
  onBack?: () => void;
}> = ({
  leituras,
  oQueConferir,
  backLabel,
  onBack
}) => {
  const { falhas, tentarDeNovo, tentando } = useLeiturasComFalha(leituras);
  return (
    <Instrument360Page>
      <div data-testid="instrument-state-escopo-nao-conferido" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <FontesComFalhaAviso falhas={falhas} onTentar={() => void tentarDeNovo()} tentando={tentando} onde="da tela" testIdPrefix="escopo-fontes" />
        <p style={{ margin: 0, color: 'var(--color-text-muted, #64748b)', fontSize: '0.9rem' }}>
          Sem essas leituras não dá para conferir se {oQueConferir}. Tente de novo em instantes.
        </p>
        {onBack && (
          <div>
            <ActionButton action="voltar" onClick={onBack}>
              {backLabel}
            </ActionButton>
          </div>
        )}
      </div>
    </Instrument360Page>
  );
};
