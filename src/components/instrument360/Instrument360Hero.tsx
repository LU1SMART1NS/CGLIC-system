import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { PRAZO_COLORS, type PrazoFaixa } from '../carteira/carteiraPrazo';
import { toSentenceCaseIfAllCaps } from '../../utils/textCase';

/** Identificador do rodapé (processo, categoria, Id PNCP...). Nunca data nem valor. */
export interface Instrument360MetaItem {
  label: string;
  value?: React.ReactNode;
}

/** Item da linha de datas, sempre logo abaixo do objeto. */
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
  /** Gestor titular, à direita do título. */
  manager?: React.ReactNode;
  /** Linha logo abaixo do título (ex.: fornecedor). */
  subtitle?: React.ReactNode;
  objeto?: string;
  /** Linha logo acima das datas (ex.: ata de origem). */
  origin?: React.ReactNode;
  dates?: Instrument360DateItem[];
  /** Rodapé: só identificadores, depois dos indicadores. */
  identifiers: Instrument360MetaItem[];
  identifiersTestId: string;
  /** Indicadores (com a régua dentro do cartão de vigência). */
  children?: React.ReactNode;
}

const OBJETO_LIMITE = 220;

const COLORS = { ink: '#0f172a', inkSoft: '#334155', muted: '#64748b', line: '#e2e8f0', surface: '#f8fafc', link: '#075985', brand: '#0c326f' };

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
  const statusColors = status ? (status.neutral ? { color: COLORS.inkSoft, bg: COLORS.surface } : PRAZO_COLORS[status.faixa]) : null;

  return (
    <header
      style={{
        display: 'grid',
        gap: '14px',
        background: '#ffffff',
        borderRadius: '12px',
        border: `1px solid ${COLORS.line}`,
        padding: '20px 24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        marginBottom: '1.5rem'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <button
          type="button"
          onClick={onBack}
          data-testid={backTestId}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.45rem 0.85rem',
            background: COLORS.surface,
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: 700,
            color: COLORS.brand,
            cursor: 'pointer'
          }}
        >
          <ArrowLeft size={16} /> {backLabel}
        </button>
        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>{actions}</div>}
      </div>

      {notice && <div>{notice}</div>}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px 24px' }}>
        <div style={{ display: 'grid', gap: '4px', flex: '1 1 420px', minWidth: 0 }}>
          {eyebrow && (
            <div style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: COLORS.muted }}>
              {eyebrow}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {icon}
            <h1 style={{ margin: 0, fontSize: '1.85rem', lineHeight: 1.1, fontWeight: 800, color: COLORS.ink }}>{title}</h1>
            {status && statusColors && (
              <span
                data-testid="instrument-360-status"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 10px',
                  borderRadius: '999px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: statusColors.color,
                  background: statusColors.bg,
                  border: status.neutral ? `1px solid ${COLORS.line}` : '1px solid transparent'
                }}
              >
                <span aria-hidden="true" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'currentColor' }} />
                {status.label}
              </span>
            )}
          </div>

          {subtitle && <div style={{ fontSize: '0.9rem', color: COLORS.inkSoft }}>{subtitle}</div>}

          {texto && (
            <p style={{ margin: subtitle ? '2px 0 0 0' : 0, fontSize: '0.92rem', color: COLORS.inkSoft, lineHeight: 1.45, maxWidth: '1200px' }}>
              {objetoLongo && !objetoAberto ? `${texto.slice(0, OBJETO_LIMITE).trimEnd()}…` : texto}
              {objetoLongo && (
                <button
                  type="button"
                  onClick={() => setObjetoAberto((v) => !v)}
                  style={{ marginLeft: '0.4rem', background: 'none', border: 'none', padding: 0, color: COLORS.brand, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                >
                  {objetoAberto ? 'ver menos' : 'ver mais'}
                </button>
              )}
            </p>
          )}

          {origin && <div style={{ marginTop: '6px', fontSize: '0.9rem', color: COLORS.inkSoft }}>{origin}</div>}

          {dates && dates.length > 0 && (
            <p style={{ margin: origin ? 0 : texto ? '6px 0 0 0' : 0, display: 'flex', flexWrap: 'wrap', gap: '4px 18px', fontSize: '0.86rem', color: COLORS.inkSoft }}>
              {dates.map((d) => (
                <span key={d.label} title={d.title} tabIndex={d.title ? 0 : undefined}>
                  <b style={{ fontWeight: 600, color: COLORS.muted }}>{d.label}</b>{' '}
                  <span style={d.emphasis ? { fontWeight: 700, color: COLORS.link } : undefined}>{d.value}</span>
                  {d.risk && <span style={{ marginLeft: '0.75rem', fontWeight: 700, color: '#b91c1c' }}>{d.risk}</span>}
                </span>
              ))}
            </p>
          )}
        </div>

        {manager && <div>{manager}</div>}
      </div>

      {children}

      {identifiers.length > 0 && (
        <dl
          data-testid={identifiersTestId}
          style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', margin: 0, paddingTop: '10px', borderTop: `1px solid ${COLORS.line}`, fontSize: '0.78rem', color: COLORS.muted }}
        >
          {identifiers.map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', gap: '0.3rem' }}>
              <dt style={{ fontWeight: 600, color: COLORS.inkSoft }}>{label}</dt>
              <dd style={{ margin: 0, color: value ? COLORS.muted : '#94a3b8', fontStyle: value ? 'normal' : 'italic' }}>{value || 'Não informado'}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
};

/** Situação ao lado do título. Os dias restantes ficam só no indicador de vigência. */
export function instrumentSituationLabel(faixa: PrazoFaixa, cancelada = false): string {
  if (cancelada) return 'Cancelada no PNCP';
  if (faixa === 'EXPIRADO') return 'Encerrada';
  if (faixa === 'SEM_DATA') return 'Vigência não informada';
  return 'Vigente';
}
