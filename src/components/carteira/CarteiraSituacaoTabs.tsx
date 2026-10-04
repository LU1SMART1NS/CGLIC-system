import React from 'react';
import type { CarteiraStatusFilter } from './carteiraPrazo';
import { VIGENCIA_RULES } from '../../config/alertRules';

export type CarteiraSituacao = CarteiraStatusFilter | 'TODOS';

interface CarteiraSituacaoTabsProps {
  /** Prefixo dos data-testid (ex.: "arp" → "arp-situacao-CRITICO"). */
  testIdPrefix: string;
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
 * Situação da carteira em segmentos com contagem (padrão "Open · Closed" das listas do GitHub/Jira):
 * Vigentes · Crítico · Atenção · Histórico · Todas. Substitui os cartões de resumo e o seletor de vigência.
 */
export const CarteiraSituacaoTabs: React.FC<CarteiraSituacaoTabsProps> = ({
  testIdPrefix,
  vigentes,
  criticos,
  atencao,
  historico,
  total,
  active,
  onSelect,
  meta
}) => {
  const segmentos: Array<{ id: CarteiraSituacao; label: string; count: number; dot?: string; title?: string }> = [
    { id: 'VIGENTES', label: 'Vigentes', count: vigentes },
    { id: 'CRITICO', label: 'Crítico', count: criticos, dot: '#dc2626', title: `Vencem em até ${VIGENCIA_RULES.faixaCriticoAteDias} dias` },
    {
      id: 'ATENCAO',
      label: 'Atenção',
      count: atencao,
      dot: '#d97706',
      title: `Vencem entre ${VIGENCIA_RULES.faixaCriticoAteDias + 1} e ${VIGENCIA_RULES.faixaAtencaoAteDias} dias`
    },
    { id: 'HISTORICO', label: 'Histórico', count: historico, title: 'Expirados ou cancelados' },
    { id: 'TODOS', label: 'Todas', count: total }
  ];

  return (
    <div
      role="group"
      aria-label="Situação"
      className="ds-tabs-scroll"
      style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}
    >
      {segmentos.map((s) => {
        const on = s.id === active;
        return (
          <button
            key={s.id}
            type="button"
            title={s.title}
            aria-pressed={on}
            onClick={() => onSelect(s.id)}
            data-testid={`${testIdPrefix}-situacao-${s.id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.75rem',
              marginBottom: '-1px',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${on ? '#0c326f' : 'transparent'}`,
              color: on ? '#0f172a' : '#64748b',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {s.dot && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot }} />}
            {s.label}
            <span style={{ color: '#0f172a', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{s.count}</span>
          </button>
        );
      })}
      {meta && (
        <span style={{ marginLeft: 'auto', paddingLeft: '0.75rem', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {meta}
        </span>
      )}
    </div>
  );
};
