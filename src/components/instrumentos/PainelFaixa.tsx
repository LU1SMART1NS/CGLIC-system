import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Instrument360DockProvider } from '../instrument360/Instrument360DockProvider';
import { Instrument360Head } from '../instrument360/Instrument360Head';
import { scrollToSummary, useInstrument360Dock } from '../instrument360/instrument360Dock';
import { PAINEL_GAVETA_NOMES, type PainelGavetaId } from './painelGavetasConfig';

/** Número de um cartão repetido na faixa azul (o mesmo clique do cartão). */
export interface PainelFaixaChip {
  id: string;
  rotulo: string;
  valor: string;
  /** Vermelho quando o cartão pede ação. */
  perigo?: boolean;
  /** Cartão escolhido (filtra a lista). */
  ativo?: boolean;
  onClick: () => void;
}

interface PainelFaixaProps {
  /** "Início" e, com um gestor ou fiscal escolhido no filtro, o nome dele. */
  titulo: string;
  chips: PainelFaixaChip[];
  gavetas?: PainelGavetaId[];
  gavetaAberta?: PainelGavetaId | null;
  onToggleGaveta?: (id: PainelGavetaId) => void;
  testId: string;
  /** Início dos testIds dos botões (`<prefixo>-chip-<id>`, `<prefixo>-gaveta-<id>`); padrão: `testId`. */
  prefixo?: string;
}

/**
 * Faixa azul dos Painéis do Início (mesmo bloco das telas 360): aparece quando a página rola e os cartões encolhem.
 * O nome volta ao topo; os números repetem os cartões; os botões abrem as gavetas do "Ver mais".
 */
export const PainelFaixa: React.FC<PainelFaixaProps> = ({ titulo, chips, gavetas = [], gavetaAberta = null, onToggleGaveta, testId, prefixo = testId }) => {
  const min = useInstrument360Dock()?.min ?? false;
  const tab = min ? 0 : -1;
  return (
    <div className="vg-strip" aria-hidden={!min} data-testid={testId}>
      <div className="vg-strip-in">
        <div className="vg-strip-row">
          <button type="button" className="vg-strip-title" onClick={scrollToSummary} tabIndex={tab} aria-label={`${titulo}: voltar ao resumo completo`}>
            {titulo}
          </button>
          <div className="vg-chips">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                tabIndex={tab}
                aria-pressed={c.ativo ?? false}
                className={c.perigo ? 'vg-chip vg-chip--danger' : 'vg-chip'}
                onClick={c.onClick}
                data-testid={`${prefixo}-chip-${c.id}`}
              >
                {c.rotulo} <strong>{c.valor}</strong>
              </button>
            ))}
          </div>
          {gavetas.length > 0 && onToggleGaveta && (
            <div className="vg-chips vg-chips--gavetas">
              {gavetas.map((id) => (
                <button
                  key={id}
                  type="button"
                  tabIndex={tab}
                  aria-expanded={gavetaAberta === id}
                  className="vg-chip"
                  onClick={() => onToggleGaveta(id)}
                  data-testid={`${prefixo}-gaveta-${id}`}
                >
                  {PAINEL_GAVETA_NOMES[id]} <ChevronDown size={14} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface PainelComFaixaProps {
  /** A faixa azul (`PainelFaixa`). */
  faixa: React.ReactNode;
  /** O que encolhe ao rolar: cartões, "Ver mais", "Com você" e o título das Pendências. */
  topo: React.ReactNode;
  /** Abas das Pendências: ficam grudadas embaixo da faixa. */
  trilho?: React.ReactNode;
  /** Gaveta aberta, filtros e a lista. */
  children: React.ReactNode;
  /** Ponto de rolagem (`scrollToDock`): os cartões levam à lista com a faixa encolhida. */
  dockRef?: React.Ref<HTMLDivElement>;
}

/**
 * Moldura comum dos Painéis do Início (Atas e Contratos, Emendas, Fiscalização), a do Painel de Atas e Contratos:
 * cartões e "Ver mais" encolhem numa faixa azul fixa ao rolar e as abas das Pendências grudam logo abaixo.
 */
export const PainelComFaixa: React.FC<PainelComFaixaProps> = ({ faixa, topo, trilho, children, dockRef }) => (
  <Instrument360DockProvider>
    {/* A lista tem de ser o irmão seguinte do bloco; o espaço perdido ao encolher volta no fim (--i360-lost). */}
    <div style={{ paddingBottom: 'var(--i360-lost, 0px)' }}>
      <Instrument360Head>
        {faixa}
        <div className="i360-fold" ref={dockRef}>
          <div className="i360-fold-in">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '0.75rem' }}>{topo}</div>
          </div>
        </div>
        {trilho && <div className="vg-rail">{trilho}</div>}
      </Instrument360Head>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>{children}</div>
    </div>
  </Instrument360DockProvider>
);
