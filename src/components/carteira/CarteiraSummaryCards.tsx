import React from 'react';
import { CheckCircle2, AlertTriangle, Clock, Archive } from 'lucide-react';
import type { CarteiraStatusFilter } from './carteiraPrazo';
import { VIGENCIA_RULES } from '../../config/alertRules';

export interface CarteiraSummaryCardsProps {
  /** Prefixo dos data-testid (ex.: "contracts" → "contracts-summary-card-vigentes"). */
  testIdPrefix: string;
  vigentes: number;
  criticos: number;
  atencao: number;
  historico: number;
  /** Legenda curta abaixo do número de vigentes (ex.: valor vigente total). */
  vigentesHint?: string;
  /** Segunda linha dos cards de valor (ex.: "R$ 1,23 bi em valor vigente"); histórico não leva valor. */
  vigentesValorHint?: string;
  criticoValorHint?: string;
  atencaoValorHint?: string;
  historicoHint: string;
  active: CarteiraStatusFilter | 'TODOS';
  onSelect: (status: CarteiraStatusFilter | 'TODOS') => void;
}

/**
 * 4 cards de resumo no padrão da Visão Geral: vigentes, crítico (≤30 dias),
 * atenção (31–90 dias) e histórico. Clicar filtra a tabela; clicar de novo
 * no card ativo volta ao filtro padrão (vigentes).
 */
export const CarteiraSummaryCards: React.FC<CarteiraSummaryCardsProps> = ({
  testIdPrefix,
  vigentes,
  criticos,
  atencao,
  historico,
  vigentesHint,
  vigentesValorHint,
  criticoValorHint,
  atencaoValorHint,
  historicoHint,
  active,
  onSelect
}) => {
  const cards: Array<{
    id: CarteiraStatusFilter;
    label: string;
    count: number;
    hint: string;
    hint2?: string;
    icon: React.ComponentType<{ size?: number }>;
    color: string;
    bg: string;
    border: string;
  }> = [
    { id: 'VIGENTES', label: 'Vigentes', count: vigentes, hint: vigentesHint || 'Em vigência', hint2: vigentesValorHint, icon: CheckCircle2, color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
    { id: 'CRITICO', label: `Crítico (≤${VIGENCIA_RULES.faixaCriticoAteDias} dias)`, count: criticos, hint: `Vencem em até ${VIGENCIA_RULES.faixaCriticoAteDias} dias`, hint2: criticoValorHint, icon: AlertTriangle, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    { id: 'ATENCAO', label: `Atenção (${VIGENCIA_RULES.faixaCriticoAteDias + 1}–${VIGENCIA_RULES.faixaAtencaoAteDias} dias)`, count: atencao, hint: `Vencem entre ${VIGENCIA_RULES.faixaCriticoAteDias + 1} e ${VIGENCIA_RULES.faixaAtencaoAteDias} dias`, hint2: atencaoValorHint, icon: Clock, color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
    { id: 'HISTORICO', label: 'Histórico', count: historico, hint: historicoHint, icon: Archive, color: '#475569', bg: '#f1f5f9', border: '#cbd5e1' }
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.9rem' }}>
      {cards.map((card) => {
        const Icon = card.icon;
        const isActive = active === card.id;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(isActive && card.id !== 'VIGENTES' ? 'VIGENTES' : card.id)}
            data-testid={`${testIdPrefix}-summary-card-${card.id.toLowerCase()}`}
            style={{
              background: isActive ? card.bg : '#ffffff',
              border: `2px solid ${isActive ? card.color : card.border}`,
              borderRadius: '10px',
              padding: '0.95rem 1.1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.45rem',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease-in-out',
              boxShadow: isActive ? '0 4px 6px -1px rgba(0, 0, 0, 0.07)' : '0 1px 2px rgba(0, 0, 0, 0.03)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: isActive ? card.color : '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {card.label}
              </span>
              <div style={{ background: isActive ? '#ffffff' : card.bg, color: card.color, padding: '0.35rem', borderRadius: '6px', display: 'flex' }}>
                <Icon size={16} />
              </div>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: card.color, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {card.count}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{card.hint}</div>
            {card.hint2 && <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '-0.3rem' }}>{card.hint2}</div>}
          </button>
        );
      })}
    </div>
  );
};
