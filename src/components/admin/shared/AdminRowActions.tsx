import React from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { IconButton } from '../../../design-system/components/IconButton';

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
    {onEdit && <IconButton label={`Editar ${name}`} icon={<Edit2 size={16} />} onClick={onEdit} disabled={disabled} />}
    {onDelete && (
      <IconButton
        label={`${deleteLabel} ${name}`}
        icon={<Trash2 size={16} />}
        onClick={onDelete}
        disabled={disabled}
        style={{ color: '#ef4444' }}
      />
    )}
  </div>
);
