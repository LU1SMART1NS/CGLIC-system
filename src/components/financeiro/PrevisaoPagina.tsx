import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { ActionButton } from '../../design-system/components/ActionButton';
import { Tabs } from '../../design-system/components/Tabs';
import { PrevisaoMes } from './PrevisaoMes';
import { PrevisaoContratos } from './PrevisaoContratos';

/**
 * Pagamentos → Previsão do mês (/pagamentos/previsao): a previsão que a CGLIC informa à DGFNSP até o último dia útil
 * (Portaria DGFNSP 50/2025, art. 5º, § 2º, III) e como cada contrato costuma ser pago, base dela.
 */
export const PrevisaoPagina: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const visao = params.get('visao') === 'contratos' ? 'contratos' : 'mes';
  // Cada visão tem os próprios filtros: trocar de visão limpa a URL.
  const trocar = (v: string) => setParams(v === 'contratos' ? { visao: 'contratos' } : {}, { replace: true });

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Previsão de pagamentos"
        subtitle="O que a CGLIC informa à DGFNSP até o último dia útil do mês, para os pagamentos do mês seguinte."
        icon={<CalendarClock size={26} color="var(--primary)" aria-hidden="true" />}
        actions={<ActionButton action="voltar" onClick={() => navigate('/pagamentos')} label="Voltar para Pagamentos" data-testid="previsao-voltar" />}
      />
      <Tabs
        tabs={[
          { id: 'mes', label: 'Previsão do mês' },
          { id: 'contratos', label: 'Como cada contrato é pago' }
        ]}
        activeTabId={visao}
        onTabChange={trocar}
        ariaLabel="Visão da previsão"
        testId="previsao-visao"
      />
      {visao === 'contratos' ? <PrevisaoContratos /> : <PrevisaoMes />}
    </PageContainer>
  );
};
