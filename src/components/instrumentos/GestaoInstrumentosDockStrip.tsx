import React from 'react';
import { formatCurrencyCompact, formatNumber } from '../../utils/format';
import type { GestaoInstrumentosCardId, GestaoInstrumentosCounts } from './GestaoInstrumentosSummaryCards';
import type { PainelGavetaId } from './painelGavetasConfig';
import { PainelFaixa } from './PainelFaixa';

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
 * Faixa azul do Painel de Atas e Contratos (peça comum `PainelFaixa`): o nome leva de volta ao topo e os números
 * em miniatura filtram a lista como os cartões. Só aparece com o bloco encolhido.
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
    <PainelFaixa
      titulo={`Início${gestorNome ? ` · ${gestorNome}` : ''}`}
      chips={chips.map((c) => ({ id: c.id, rotulo: c.label, valor: c.value, perigo: c.danger, ativo: activeCard === c.id, onClick: () => onSelectCard(c.id) }))}
      gavetas={gavetas}
      gavetaAberta={gavetaAberta}
      onToggleGaveta={onToggleGaveta}
      testId="instrumentos-dock-strip"
      prefixo="instrumentos-dock"
    />
  );
};
