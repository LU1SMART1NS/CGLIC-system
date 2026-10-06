import React from 'react';
import { ActionButton } from '../../../design-system/components/ActionButton';

export interface AdminRowActionsProps {
  /** Nome do registro, usado no texto acessível ("Editar DFNSP"). */
  name: string;
  onEdit?: () => void;
  onDelete?: () => void;
  disabled?: boolean;
  deleteLabel?: string;
}

/** Ações de linha padrão das listas administrativas: editar e excluir. */
export const AdminRowActions: React.FC<AdminRowActionsProps> = ({ name, onEdit, onDelete, disabled, deleteLabel = 'Excluir' }) => (
  <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
    {onEdit && <ActionButton action="editar" iconOnly label={`Editar ${name}`} onClick={onEdit} disabled={disabled} />}
    {onDelete && (
      <ActionButton action="excluir" iconOnly label={`${deleteLabel} ${name}`} onClick={onDelete} disabled={disabled} />
    )}
  </div>
);
