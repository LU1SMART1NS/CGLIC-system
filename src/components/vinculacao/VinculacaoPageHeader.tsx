import React from 'react';
import { Link2 } from 'lucide-react';
import { PageHeader } from '../../design-system/components/PageHeader';

/** Cabeçalho das páginas do menu Vinculação (mesmo ícone e moldura). */
export const VinculacaoPageHeader: React.FC<{ title: string; subtitle: string; hint?: string; actions?: React.ReactNode }> = ({ title, subtitle, hint, actions }) => (
  <PageHeader title={title} subtitle={subtitle} hint={hint} icon={<Link2 size={26} color="var(--primary)" aria-hidden="true" />} actions={actions} />
);
