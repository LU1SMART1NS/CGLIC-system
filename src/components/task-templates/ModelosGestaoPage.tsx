import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sliders } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { Tabs } from '../../design-system/components/Tabs';
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
        icon={<Sliders size={26} color="var(--primary)" aria-hidden="true" />}
      />

      <Tabs
        tabs={TABS}
        activeTabId={active}
        onTabChange={(id) => setSearchParams({ tipo: id }, { replace: true })}
        ariaLabel="Tipo de modelo de gestão"
        testId="modelos-tabs"
      />

      <div
        role="tabpanel"
        id="tabpanel-atas"
        aria-labelledby="tab-atas"
        hidden={active !== 'atas'}
      >
        <AtaTaskTemplatesPage embedded />
      </div>
      <div
        role="tabpanel"
        id="tabpanel-contratos"
        aria-labelledby="tab-contratos"
        hidden={active !== 'contratos'}
      >
        <ContractTaskTemplatesPage embedded />
      </div>
    </PageContainer>
  );
};
