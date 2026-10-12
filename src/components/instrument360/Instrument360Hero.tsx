import React from 'react';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import type { PrazoFaixa } from '../carteira/carteiraPrazo';
import { toSentenceCaseIfAllCaps } from '../../utils/textCase';
import { InstrumentAlertBadge, InstrumentStatusBadge } from './Instrument360Badges';
import { scrollToSummary, useInstrument360Dock } from './instrument360Dock';

/** Identificador do rodapé (processo, categoria, Id PNCP...). Nunca data nem valor. */
export interface Instrument360MetaItem {
  label: string;
  value?: React.ReactNode;
}

/** Linha da coluna lateral (origem e datas): rótulo à esquerda, valor à direita. */
export interface Instrument360DateItem {
  label: string;
  value: React.ReactNode;
  /** Destaque da vigência (azul e negrito). */
  emphasis?: boolean;
  /** Aviso ao lado do valor (ex.: "vence em 8 dias"). */
  risk?: React.ReactNode;
  /** Texto de apoio ao passar o mouse ou focar. */
  title?: string;
}

/** Instrumento de onde este deriva (ex.: "Ata de origem"), primeira linha da coluna lateral. */
export interface Instrument360Origin {
  label: string;
  value: React.ReactNode;
}

interface Instrument360HeroProps {
  backLabel: string;
  onBack: () => void;
  backTestId?: string;
  /** Ações do topo à direita (links PNCP, atualizar empenhos...). */
  actions?: React.ReactNode;
  /** Aviso logo abaixo do topo (ex.: resultado de uma sincronização). */
  notice?: React.ReactNode;
  icon?: React.ReactNode;
  title: string;
  /** UASG e unidade, acima do título: mesmo formato nas três telas. */
  eyebrow?: React.ReactNode;
  /** Situação ao lado do título. `neutral` mostra o selo cinza (a gravidade fica no indicador). */
  status?: { faixa: PrazoFaixa; label: string; neutral?: boolean };
  /** Aviso em selo vermelho ao lado da situação (ex.: "Ata vence em 8 dias"). */
  statusAlert?: React.ReactNode;
  /** Aviso da barra fixa quando o `statusAlert` não é texto ou a tela não o mostra no cartão (ex.: "Vence em 8 dias"). */
  dockAlert?: string;
  /** Fornecedor em texto simples, para a barra fixa. */
  dockSubtitle?: string;
  /** Gestor, no alto da coluna lateral à direita. */
  manager?: React.ReactNode;
  /** Linha logo abaixo do título (ex.: fornecedor). */
  subtitle?: React.ReactNode;
  objeto?: string;
  /** Primeira linha da coluna lateral, acima das datas (ex.: ata de origem). */
  origin?: Instrument360Origin;
  /** Linhas da coluna lateral, abaixo do gestor e da origem. */
  dates?: Instrument360DateItem[];
  /** Rodapé: só identificadores, depois dos indicadores. */
  identifiers: Instrument360MetaItem[];
  identifiersTestId: string;
  /** Indicadores (com a régua dentro do cartão de vigência). */
  children?: React.ReactNode;
}

const OBJETO_LIMITE = 220;

const COLORS = { ink: '#0f172a', inkSoft: '#334155', muted: '#64748b', line: '#e2e8f0', surface: '#f8fafc', link: 'var(--primary)', brand: 'var(--primary)' };

/**
 * Cartão único do topo das telas 360 (Ata, Contrato e Item), na mesma ordem nas três:
 * UASG, título com a situação e o gestor, fornecedor, objeto, linha da ata, datas, indicadores e,
 * por último, os identificadores. Cada dado aparece uma vez por tela.
 */
export const Instrument360Hero: React.FC<Instrument360HeroProps> = ({
  backLabel,
  onBack,
  backTestId,
  actions,
  notice,
  icon,
  title,
  eyebrow,
  status,
  statusAlert,
  dockAlert,
  dockSubtitle,
  manager,
  subtitle,
  objeto,
  origin,
  dates,
  identifiers,
  identifiersTestId,
  children
}) => {
  const [objetoAberto, setObjetoAberto] = React.useState(false);
  const texto = toSentenceCaseIfAllCaps(objeto);
  const objetoLongo = Boolean(texto && texto.length > OBJETO_LIMITE);
  const dock = useInstrument360Dock();
  const min = dock?.min ?? false;

  return (
    <header className="i360-hero i360-hero-wrap" data-testid="instrument-360-hero">
      <Fold>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', paddingBottom: '14px' }}>
          <ActionButton action="voltar"
            type="button"
            size="sm"
            onClick={onBack}
            data-testid={backTestId}
          >{backLabel}</ActionButton>
          {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>{actions}</div>}
        </div>
      </Fold>

      {notice && <Fold><div style={{ paddingBottom: '14px' }}>{notice}</div></Fold>}

      <div className="i360-identity">
        <div className="i360-identity-main">
          {eyebrow && (
            <Fold>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: COLORS.muted, paddingBottom: '4px' }}>
                {eyebrow}
              </div>
            </Fold>
          )}

          <div className="i360-title-row">
            {icon}
            <h1 className="i360-title">
              {/* Encolhido, o nome leva de volta ao cartão inteiro. */}
              <button
                type="button"
                className="i360-title-btn"
                onClick={scrollToSummary}
                tabIndex={min ? 0 : -1}
                aria-label={min ? `${title}: voltar ao resumo completo` : undefined}
              >
                {title}
              </button>
            </h1>
            {status && <InstrumentStatusBadge status={status} testId="instrument-360-status" compact={min} />}
            {statusAlert && <InstrumentAlertBadge testId="instrument-360-status-alert" compact={min}>{statusAlert}</InstrumentAlertBadge>}
            {dockAlert && !statusAlert && <span className="i360-min-only"><InstrumentAlertBadge compact>{dockAlert}</InstrumentAlertBadge></span>}
            {dockSubtitle && <span className="i360-sub-inline" aria-hidden="true">{dockSubtitle}</span>}
          </div>

          {(subtitle || texto) && (
            <Fold>
              <div style={{ display: 'grid', gap: '2px', paddingTop: '4px' }}>
                {subtitle && <div style={{ fontSize: '0.9rem', color: COLORS.inkSoft }}>{subtitle}</div>}
                {texto && (
                  <p style={{ margin: subtitle ? '2px 0 0 0' : 0, fontSize: '0.92rem', color: COLORS.inkSoft, lineHeight: 1.45, maxWidth: '1200px' }}>
                    {objetoLongo && !objetoAberto ? `${texto.slice(0, OBJETO_LIMITE).trimEnd()}…` : texto}
                    {objetoLongo && (
                      <AppButton
                        type="button"
                        variant="link"
                        size="xs"
                        onClick={() => setObjetoAberto((v) => !v)}
                        style={{ marginLeft: '0.4rem' }}
                      >
                        {objetoAberto ? 'ver menos' : 'ver mais'}
                      </AppButton>
                    )}
                  </p>
                )}
              </div>
            </Fold>
          )}
        </div>

        {(manager || origin || (dates && dates.length > 0)) && (
          <div className="i360-side-fold" data-i360-fold="">
            <div className="i360-side-clip">
            <div className="i360-side" data-testid="instrument-360-side">
              {manager && <div>{manager}</div>}
              {(origin || (dates && dates.length > 0)) && (
                <dl className="i360-datalist">
                  {origin && (
                    <div className="i360-dr" data-testid="instrument-360-origin">
                      <dt>{origin.label}</dt>
                      <dd>{origin.value}</dd>
                    </div>
                  )}
                  {(dates ?? []).map((d) => (
                    <div key={d.label} className={d.emphasis ? 'i360-dr i360-dr--emphasis' : 'i360-dr'} title={d.title} tabIndex={d.title ? 0 : undefined}>
                      <dt>{d.label}</dt>
                      <dd>
                        {d.value}
                        {d.risk && <span className="i360-dr-risk">{d.risk}</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            </div>
          </div>
        )}
      </div>

      {children && <Fold><div style={{ paddingTop: '14px' }}>{children}</div></Fold>}

      {identifiers.length > 0 && (
        <Fold>
          <dl
            data-testid={identifiersTestId}
            style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', margin: '14px 0 0', paddingTop: '10px', borderTop: `1px solid ${COLORS.line}`, fontSize: '0.78rem', color: COLORS.muted }}
          >
            {identifiers.map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', gap: '0.3rem' }}>
                <dt style={{ fontWeight: 600, color: COLORS.inkSoft }}>{label}</dt>
                <dd style={{ margin: 0, color: value ? COLORS.muted : '#94a3b8', fontStyle: value ? 'normal' : 'italic' }}>{value || 'Não informado'}</dd>
              </div>
            ))}
          </dl>
        </Fold>
      )}
    </header>
  );
};

/** Bloco do cartão que some quando ele encolhe (a altura vai a zero, sem pular). */
const Fold: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`i360-fold${className ? ` ${className}` : ''}`} data-i360-fold="">
    <div className="i360-fold-in">{children}</div>
  </div>
);

/** Situação ao lado do título. Os dias restantes ficam só no indicador de vigência. */
export function instrumentSituationLabel(faixa: PrazoFaixa, cancelada = false): string {
  if (cancelada) return 'Cancelada no PNCP';
  if (faixa === 'EXPIRADO') return 'Encerrada';
  if (faixa === 'SEM_DATA') return 'Vigência não informada';
  return 'Vigente';
}
