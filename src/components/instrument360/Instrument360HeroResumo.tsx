import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, FileText } from 'lucide-react';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { Modal } from '../../design-system/components/Modal';
import { toSentenceCaseIfAllCaps } from '../../utils/textCase';
import { InstrumentAlertBadge, InstrumentStatusBadge } from './Instrument360Badges';
import { CarteiraNovoBadge } from '../carteira/CarteiraNovoBadge';
import { HealthTileModeContext } from './HealthStripParts';
import { scrollToSummary, useInstrument360Dock } from './instrument360Dock';
import type { Instrument360HeroProps } from './Instrument360Hero';

const COLORS = { ink: '#0f172a', inkSoft: '#334155', muted: '#64748b', line: '#e2e8f0' };

const EYEBROW: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: COLORS.muted };

/**
 * Cartão do topo das telas 360 no celular (aprovado por protótipo em 16/10/2026). Cabe numa tela: UASG numa
 * linha, título e selos, fornecedor, objeto em 2 linhas, gestor e vigência lado a lado e os indicadores em
 * 2 colunas, só com o valor. O resto (outras datas, identificadores, dicas e a régua) fica no resumo completo,
 * que abre em "Mais detalhes" ou no botão Resumo da barra azul. A barra aparece quando o cartão sai da tela.
 */
export const Instrument360HeroResumo: React.FC<Instrument360HeroProps> = ({
  backLabel,
  onBack,
  backTestId,
  actions,
  notice,
  icon,
  title,
  eyebrow,
  status,
  novidade,
  statusAlert,
  dockAlert,
  manager,
  subtitle,
  objeto,
  origin,
  dates,
  identifiers,
  identifiersTestId,
  children
}) => {
  const [aberto, setAberto] = React.useState(false);
  const dock = useInstrument360Dock();
  const texto = toSentenceCaseIfAllCaps(objeto);
  const vigencia = (dates ?? []).find((d) => d.emphasis);
  const badges = (compact: boolean) => (
    <>
      {status && <InstrumentStatusBadge status={status} testId={compact ? undefined : 'instrument-360-status'} compact={compact} />}
      {novidade && <CarteiraNovoBadge genero={novidade} testId={compact ? undefined : 'instrument-360-novidade'} />}
      {statusAlert && <InstrumentAlertBadge testId={compact ? undefined : 'instrument-360-status-alert'} compact={compact}>{statusAlert}</InstrumentAlertBadge>}
    </>
  );

  const barra = dock?.phoneBarSlot
    ? createPortal(
        <div className="i360-pbar-row">
          {/* Nome da ata, contrato ou item: volta ao cartão no alto da página. */}
          <button type="button" className="i360-pbar-title" onClick={scrollToSummary} aria-label={`${title}: voltar ao cartão`}>
            <span className="i360-pbar-name">{title}</span>
            {status && <InstrumentStatusBadge status={status} compact />}
            {(dockAlert || typeof statusAlert === 'string') && <InstrumentAlertBadge compact>{dockAlert ?? statusAlert}</InstrumentAlertBadge>}
          </button>
          <AppButton type="button" variant="outline" size="sm" className="i360-pbar-resumo" icon={<FileText size={15} />} onClick={() => setAberto(true)} data-testid="instrument-360-resumo-btn">
            Resumo
          </AppButton>
        </div>,
        dock.phoneBarSlot
      )
    : null;

  return (
    <header className="i360-hero i360-hero--resumo" data-testid="instrument-360-hero">
      <div className="i360-topo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <ActionButton action="voltar" type="button" size="sm" onClick={onBack} aria-label={backLabel} data-testid={backTestId}>
          Voltar
        </ActionButton>
        {actions && <div className="i360-topo-acoes" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>{actions}</div>}
      </div>

      {notice}

      <div style={{ display: 'grid', gap: '6px', minWidth: 0 }}>
        {eyebrow && <div style={{ ...EYEBROW, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{eyebrow}</div>}
        <div className="i360-title-row">
          {icon}
          <h1 className="i360-title">{title}</h1>
          {badges(false)}
        </div>
        {subtitle && <div style={{ fontSize: '0.9rem', color: COLORS.inkSoft }}>{subtitle}</div>}
        {texto && (
          <p
            data-testid="instrument-360-objeto"
            style={{ margin: 0, fontSize: '0.9rem', color: COLORS.inkSoft, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {texto}
          </p>
        )}
      </div>

      {(manager || vigencia) && (
        <div className="i360-pfacts" data-testid="instrument-360-side">
          {manager && <div style={{ minWidth: 0 }}>{manager}</div>}
          {vigencia && (
            <div style={{ display: 'grid', gap: '2px', minWidth: 0, alignContent: 'start' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: COLORS.muted }}>{vigencia.label}</span>
              <strong style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--primary)' }}>
                {vigencia.value}
                {vigencia.risk && <span className="i360-dr-risk">{vigencia.risk}</span>}
              </strong>
            </div>
          )}
        </div>
      )}

      {children && <HealthTileModeContext.Provider value="resumo">{children}</HealthTileModeContext.Provider>}

      <AppButton type="button" variant="link" fullWidth className="i360-pmais" onClick={() => setAberto(true)} data-testid="instrument-360-mais-detalhes">
        Mais detalhes <ChevronDown size={16} aria-hidden="true" />
      </AppButton>

      {barra}

      <Modal
        isOpen={aberto}
        onClose={() => setAberto(false)}
        title={title}
        testId="instrument-360-resumo"
        footer={<ActionButton action="fechar" type="button" fullWidth onClick={() => setAberto(false)} />}
      >
        <div style={{ display: 'grid', gap: '14px' }}>
          <div style={{ display: 'grid', gap: '6px' }}>
            {eyebrow && <div style={EYEBROW}>{eyebrow}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 8px' }}>{badges(true)}</div>
            {subtitle && <div style={{ fontSize: '0.9rem', color: COLORS.inkSoft }}>{subtitle}</div>}
            {texto && <p style={{ margin: 0, fontSize: '0.9rem', color: COLORS.inkSoft, lineHeight: 1.5 }}>{texto}</p>}
          </div>

          {(manager || origin || (dates && dates.length > 0)) && (
            <div style={{ display: 'grid', gap: '10px', paddingTop: '12px', borderTop: `1px solid ${COLORS.line}` }}>
              {manager}
              {(origin || (dates && dates.length > 0)) && (
                <dl className="i360-datalist">
                  {origin && (
                    <div className="i360-dr">
                      <dt>{origin.label}</dt>
                      <dd>{origin.value}</dd>
                    </div>
                  )}
                  {(dates ?? []).map((d) => (
                    <div key={d.label} className={d.emphasis ? 'i360-dr i360-dr--emphasis' : 'i360-dr'} title={d.title}>
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
          )}

          {children && <HealthTileModeContext.Provider value="leitura">{children}</HealthTileModeContext.Provider>}

          {identifiers.length > 0 && (
            <dl
              data-testid={`${identifiersTestId}-resumo`}
              style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', margin: 0, paddingTop: '10px', borderTop: `1px solid ${COLORS.line}`, fontSize: '0.8rem', color: COLORS.muted }}
            >
              {identifiers.map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', gap: '0.3rem' }}>
                  <dt style={{ fontWeight: 600, color: COLORS.inkSoft }}>{label}</dt>
                  <dd style={{ margin: 0, color: value ? COLORS.muted : '#94a3b8', fontStyle: value ? 'normal' : 'italic' }}>{value || 'Não informado'}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </Modal>
    </header>
  );
};
