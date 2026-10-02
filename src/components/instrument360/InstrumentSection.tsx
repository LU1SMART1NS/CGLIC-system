import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { SectionHeader } from '../../design-system';

interface InstrumentSectionProps {
  id?: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** Contagem exibida em pílula ao lado do título. */
  count?: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Seção dentro do quadro de uma aba: o cabeçalho é sempre o `SectionHeader` do design system, o mesmo
 * das seções do Item. O quadro (borda e fundo) é do `Instrument360TabPanel`, não da seção.
 */
export const InstrumentSection: React.FC<InstrumentSectionProps> = ({ id, title, subtitle, icon: Icon, count, actions, children }) => (
  <section id={id}>
    <SectionHeader
      title={title}
      subtitle={subtitle}
      icon={Icon ? <Icon size={16} /> : undefined}
      countBadge={count}
      actions={actions}
    />
    <div>{children}</div>
  </section>
);
