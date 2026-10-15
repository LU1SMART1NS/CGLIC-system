import React from 'react';
import { ChevronDown } from 'lucide-react';
import { formatCurrencyCompact, formatNumber } from '../../utils/format';
import { scrollToSummary, useInstrument360Dock } from '../instrument360/instrument360Dock';
import type { GestaoInstrumentosCardId, GestaoInstrumentosCounts } from './GestaoInstrumentosSummaryCards';
import { PAINEL_GAVETA_NOMES, type PainelGavetaId } from './painelGavetasConfig';

interface GestaoInstrumentosDockStripProps {
  counts: GestaoInstrumentosCounts;
  activeCard: GestaoInstrumentosCardId | null;
  onSelectCard: (card: GestaoInstrumentosCardId) => void;
  saldosOnly?: boolean;
  /** Gestor escolhido no filtro do coordenador: aparece ao lado do nome, para lembrar de quem é a carteira. */
  gestorNome?: string;
  /** Botões das áreas (gavetas): abrem a gaveta sem voltar ao topo. */
  gavetas?: PainelGavetaId[];
  gavetaAberta?: PainelGavetaId | null;
  onToggleGaveta?: (id: PainelGavetaId) => void;
}

/**
 * Faixa azul do Início com os cartões encolhidos (mesmo bloco das telas 360): o nome leva de volta ao
 * topo e os números em miniatura filtram a lista como os cartões. Só aparece com o bloco encolhido.
 */
export const GestaoInstrumentosDockStrip: React.FC<GestaoInstrumentosDockStripProps> = ({
  counts,
  activeCard,
  onSelectCard,
  saldosOnly = false,
  gestorNome,
  gavetas = [],
  gavetaAberta = null,
  onToggleGaveta
}) => {
  const min = useInstrument360Dock()?.min ?? false;
  const tab = min ? 0 : -1;
  const chips: Array<{ id: GestaoInstrumentosCardId; label: string; value: string; danger?: boolean }> = [
    { id: 'ARP', label: 'Atas', value: formatNumber(counts.totalAtas) },
    ...(saldosOnly
      ? []
      : [
          { id: 'CONTRATOS' as const, label: 'Contratos', value: formatNumber(counts.contratosAtivos) },
          { id: 'VALOR' as const, label: 'Valor', value: formatCurrencyCompact(counts.valorVigenteTotal) }
        ]),
    { id: 'ALERTAS', label: saldosOnly ? 'Esgotados' : 'Críticos', value: formatNumber(counts.criticalCount), danger: counts.criticalCount > 0 }
  ];

  return (
    <div className="vg-strip" aria-hidden={!min} data-testid="instrumentos-dock-strip">
      <div className="vg-strip-in">
        <div className="vg-strip-row">
          <button type="button" className="vg-strip-title" onClick={scrollToSummary} tabIndex={tab} aria-label="Início: voltar ao resumo completo">
            Início{gestorNome ? ` · ${gestorNome}` : ''}
          </button>
          <div className="vg-chips">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                tabIndex={tab}
                aria-pressed={activeCard === c.id}
                className={c.danger ? 'vg-chip vg-chip--danger' : 'vg-chip'}
                onClick={() => onSelectCard(c.id)}
                data-testid={`instrumentos-dock-chip-${c.id}`}
              >
                {c.label} <strong>{c.value}</strong>
              </button>
            ))}
          </div>
          {gavetas.length > 0 && onToggleGaveta && (
            <div className="vg-chips vg-chips--gavetas">
              {gavetas.map((id) => (
                <button
                  key={id}
                  type="button"
                  tabIndex={tab}
                  aria-expanded={gavetaAberta === id}
                  className="vg-chip"
                  onClick={() => onToggleGaveta(id)}
                  data-testid={`instrumentos-dock-gaveta-${id}`}
                >
                  {PAINEL_GAVETA_NOMES[id]} <ChevronDown size={14} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
