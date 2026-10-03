import React from 'react';

interface Instrument360TabPanelProps {
  /** Mesmo prefixo passado ao `Instrument360Tabs` (ex.: "ata", "contract", "item"). */
  idPrefix: string;
  activeTab: string;
  /** Altura mínima, para a página não encolher e puxar a tela ao trocar de aba. */
  minHeight?: string;
  children: React.ReactNode;
}

/**
 * Quadro único do conteúdo das abas nas telas de detalhe: quadro cinza-claro com a mesma borda e o mesmo
 * espaçamento em Ata, Contrato e Item. Também é o `tabpanel` ligado à aba ativa. Trocar de aba só troca
 * o conteúdo; a moldura não muda.
 */
export const Instrument360TabPanel: React.FC<Instrument360TabPanelProps> = ({
  idPrefix,
  activeTab,
  minHeight = '28rem',
  children
}) => (
  <div
    role="tabpanel"
    id={`${idPrefix}-tabpanel-${activeTab}`}
    aria-labelledby={`${idPrefix}-tab-${activeTab}`}
    data-testid="instrument-tab-panel"
    className="i360-tabpanel"
    style={{
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      minHeight,
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem'
    }}
  >
    {children}
  </div>
);
