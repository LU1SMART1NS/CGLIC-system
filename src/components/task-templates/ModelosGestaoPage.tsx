import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sliders } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { AtaTaskTemplatesPage } from '../atas/AtaTaskTemplatesPage';
import { ContractTaskTemplatesPage } from '../contracts/ContractTaskTemplatesPage';

export type ModelosGestaoTipo = 'atas' | 'contratos';

const TABS: { id: ModelosGestaoTipo; label: string }[] = [
  { id: 'atas', label: 'Atas' },
  { id: 'contratos', label: 'Contratos' }
];

export function parseModelosGestaoTipo(value: string | null): ModelosGestaoTipo {
  return value === 'contratos' ? 'contratos' : 'atas';
}

/**
 * Modelos de Gestão de Atas e de Contratos numa só tela, em abas. A aba ativa vai na URL
 * (?tipo=atas|contratos). As duas abas ficam montadas para não perder um rascunho ao trocar.
 */
export const ModelosGestaoPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = parseModelosGestaoTipo(searchParams.get('tipo'));

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Modelos de Gestão"
        subtitle="Padronização de planos de acompanhamento, checklists e marcos de gestão de Atas e de Contratos."
        icon={<Sliders size={26} color="#0c326f" aria-hidden="true" />}
      />

      <div
        role="tablist"
        aria-label="Tipo de modelo de gestão"
        style={{ display: 'flex', gap: '0.5rem' }}
      >
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`modelos-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`modelos-panel-${tab.id}`}
              onClick={() => setSearchParams({ tipo: tab.id }, { replace: true })}
              data-testid={`modelos-tab-${tab.id}`}
              style={{
                padding: '0.4rem 1.1rem',
                borderRadius: '999px',
                border: isActive ? '1px solid #0c326f' : '1px solid #e2e8f0',
                background: isActive ? '#0c326f' : '#ffffff',
                color: isActive ? '#ffffff' : '#475569',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="modelos-panel-atas"
        aria-labelledby="modelos-tab-atas"
        hidden={active !== 'atas'}
      >
        <AtaTaskTemplatesPage embedded />
      </div>
      <div
        role="tabpanel"
        id="modelos-panel-contratos"
        aria-labelledby="modelos-tab-contratos"
        hidden={active !== 'contratos'}
      >
        <ContractTaskTemplatesPage embedded />
      </div>
    </PageContainer>
  );
};
