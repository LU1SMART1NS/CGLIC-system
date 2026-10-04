import React from 'react';
import { Building2 } from 'lucide-react';
import { EmptyState, PageContainer, PageHeader } from '../design-system';

/**
 * Carteira → Por órgão partícipe. Página reservada: o consumo por órgão hoje só
 * existe por item (aba Órgãos participantes do Item, `participantesSummary.ts`);
 * somar a carteira inteira depende de guardar esses dados do Compras.gov no banco.
 */
export const OrgaosParticipantesRoute: React.FC = () => (
  <PageContainer>
    <PageHeader
      title="Por órgão partícipe"
      subtitle="Consumo de cada órgão partícipe somado em todas as atas."
      icon={<Building2 size={24} />}
    />
    <EmptyState
      icon={<Building2 size={28} />}
      title="Página em desenvolvimento"
      description="Por enquanto, o consumo de cada órgão aparece dentro do item da ata, na aba Órgãos participantes."
    />
  </PageContainer>
);
