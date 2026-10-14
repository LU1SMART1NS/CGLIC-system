import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { AppButton, useMediaQuery } from '../../design-system';
import { breakpoints } from '../../design-system/tokens';

/**
 * No celular, a tabela "Órgãos e unidades" mostra só a linha da SENASP e recolhe os participantes atrás de
 * "Ver os N órgãos participantes": em atas grandes (26 órgãos) a aba passava de 13 telas de rolagem.
 * No computador a lista continua inteira. Volta a recolher ao trocar de item.
 */
export function useOrgaosRecolhidos<T extends { ehSenasp: boolean }>(linhas: T[], itemKey: string) {
  const celular = useMediaQuery(`(max-width: ${breakpoints.md - 1}px)`);
  // Guarda o item em que a lista foi aberta: ao trocar de item, volta recolhida sem precisar de efeito.
  const [abertoNoItem, setAbertoNoItem] = React.useState<string | null>(null);
  const verTodos = abertoNoItem === itemKey;

  const participantes = linhas.filter((l) => !l.ehSenasp).length;
  const temSenasp = linhas.length > participantes;
  const recolhe = celular && temSenasp && participantes > 0;
  const visiveis = recolhe && !verTodos ? linhas.filter((l) => l.ehSenasp) : linhas;

  const botao = recolhe ? (
    <div style={{ marginTop: '0.6rem' }}>
      <AppButton
        variant="outline"
        size="sm"
        fullWidth
        icon={verTodos ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        onClick={() => setAbertoNoItem(verTodos ? null : itemKey)}
        aria-expanded={verTodos}
        data-testid="ver-orgaos-participantes"
      >
        {verTodos
          ? 'Recolher os órgãos participantes'
          : `Ver ${participantes === 1 ? 'o órgão participante' : `os ${participantes} órgãos participantes`}`}
      </AppButton>
    </div>
  ) : null;

  return { visiveis, botao };
}
