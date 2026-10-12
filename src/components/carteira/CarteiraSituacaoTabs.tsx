import React from 'react';
import type { CarteiraStatusFilter } from './carteiraPrazo';
import { VIGENCIA_RULES } from '../../config/alertRules';
import { CarteiraSegmentTabs, type CarteiraSegment } from './CarteiraSegmentTabs';

export type CarteiraSituacao = CarteiraStatusFilter | 'TODOS';

interface CarteiraSituacaoTabsProps {
  /** Prefixo dos data-testid (ex.: "arp" → "arp-situacao-CRITICO"). */
  testIdPrefix: string;
  /** Concordância dos rótulos: atas são femininas ("Encerradas"), contratos e itens masculinos ("Encerrados"). */
  genero?: 'f' | 'm';
  vigentes: number;
  criticos: number;
  atencao: number;
  historico: number;
  total: number;
  active: CarteiraSituacao;
  onSelect: (situacao: CarteiraSituacao) => void;
  /** Resumo curto à direita (ex.: "R$ 184,2 mi em valor vigente"). */
  meta?: string;
}

/**
 * Situação da carteira em segmentos com contagem: Vigentes · Atenção · Crítico · Todas · Encerradas.
 * Substitui os cartões de resumo e o seletor de vigência.
 */
export const CarteiraSituacaoTabs: React.FC<CarteiraSituacaoTabsProps> = ({
  testIdPrefix,
  genero = 'f',
  vigentes,
  criticos,
  atencao,
  historico,
  total,
  active,
  onSelect,
  meta
}) => {
  const segmentos: Array<CarteiraSegment<CarteiraSituacao>> = [
    { id: 'VIGENTES', label: 'Vigentes', count: vigentes, dot: 'var(--color-success)' },
    {
      id: 'ATENCAO',
      label: 'Atenção',
      count: atencao,
      dot: 'var(--color-warning-solid)',
      title: `Vencem entre ${VIGENCIA_RULES.faixaCriticoAteDias + 1} e ${VIGENCIA_RULES.faixaAtencaoAteDias} dias`
    },
    { id: 'CRITICO', label: 'Crítico', count: criticos, dot: 'var(--color-danger)', title: `Vencem em até ${VIGENCIA_RULES.faixaCriticoAteDias} dias` },
    { id: 'TODOS', label: genero === 'm' ? 'Todos' : 'Todas', count: total },
    { id: 'HISTORICO', label: genero === 'm' ? 'Encerrados' : 'Encerradas', count: historico, title: 'Expirados ou cancelados' }
  ];

  return (
    <CarteiraSegmentTabs
      segments={segmentos}
      active={active}
      onSelect={onSelect}
      testIdPrefix={`${testIdPrefix}-situacao`}
      ariaLabel="Situação"
      meta={meta}
    />
  );
};
