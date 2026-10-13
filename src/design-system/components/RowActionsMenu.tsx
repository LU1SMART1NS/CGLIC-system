import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { IconButton } from './IconButton';
import { AppButton } from './AppButton';
import { AnchoredPanel } from './AnchoredPanel';

export interface RowAction {
  label: string;
  onClick: () => void;
  /** Ação que desfaz ou remove algo: aparece em vermelho discreto. */
  danger?: boolean;
  testId?: string;
}

export interface RowActionsMenuProps {
  /** Nome acessível do botão (ex.: "Ações de Polícia Militar do DF"). */
  label: string;
  actions: RowAction[];
  testId?: string;
}

/**
 * Menu ⋯ das ações de uma linha de tabela, para quando a linha tem mais de uma ação e os botões soltos
 * poluiriam a tabela. Abre um painel ancorado ao botão (bottom sheet no celular). Sem ações, não aparece.
 */
export const RowActionsMenu: React.FC<RowActionsMenuProps> = ({ label, actions, testId }) => {
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  if (actions.length === 0) return null;
  return (
    <>
      <IconButton
        label={label}
        icon={<MoreHorizontal size={16} />}
        variant="outline"
        size="sm"
        expanded={Boolean(rect)}
        aria-haspopup="menu"
        data-testid={testId}
        onClick={(e) => {
          e.stopPropagation();
          setRect(rect ? null : e.currentTarget.getBoundingClientRect());
        }}
      />
      {rect && (
        <AnchoredPanel anchorRect={rect} onClose={() => setRect(null)} ariaLabel={label} width={280} testId={testId ? `${testId}-painel` : undefined}>
          <div role="menu" className="ds-row-menu">
            {actions.map((a) => (
              <AppButton
                key={a.label}
                type="button"
                role="menuitem"
                variant={a.danger ? 'ghostDanger' : 'ghost'}
                size="sm"
                fullWidth
                className="ds-row-menu__item"
                data-testid={a.testId}
                onClick={(e) => {
                  e.stopPropagation();
                  setRect(null);
                  a.onClick();
                }}
              >
                {a.label}
              </AppButton>
            ))}
          </div>
        </AnchoredPanel>
      )}
    </>
  );
};
