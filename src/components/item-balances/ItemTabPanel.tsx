import React from 'react';

interface ItemTabPanelProps {
  activeTab: string;
  children: React.ReactNode;
}

/**
 * Quadro único das abas do item: todas as abas aparecem dentro do mesmo contêiner (mesmo fundo, borda e
 * espaçamento), então trocar de aba só troca o conteúdo, não a moldura. A altura mínima evita que a página
 * encolha e "puxe" a tela quando a aba aberta tem pouco conteúdo.
 */
export const ItemTabPanel: React.FC<ItemTabPanelProps> = ({ activeTab, children }) => (
  <div
    role="tabpanel"
    id={`item-tabpanel-${activeTab}`}
    aria-labelledby={`item-tab-${activeTab}`}
    data-testid="item-tab-panel"
    style={{
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      padding: '1.25rem',
      minHeight: '28rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem'
    }}
  >
    {children}
  </div>
);
