import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { PRAZO_COLORS, type PrazoFaixa } from '../carteira/carteiraPrazo';

export interface Instrument360MetaItem {
  label: string;
  value?: string;
}

interface Instrument360HeroProps {
  backLabel: string;
  onBack: () => void;
  backTestId?: string;
  /** Ações do topo à direita (links PNCP, atualizar empenhos...). */
  actions?: React.ReactNode;
  /** Aviso logo abaixo do topo (ex.: resultado de uma sincronização). */
  notice?: React.ReactNode;
  icon: React.ReactNode;
  title: string;
  status: { faixa: PrazoFaixa; label: string };
  /** Gestor titular, à direita do título. */
  manager?: React.ReactNode;
  /** Linha logo abaixo do título (ex.: fornecedor do contrato). */
  subtitle?: React.ReactNode;
  objeto?: string;
  meta: Instrument360MetaItem[];
  metaTestId: string;
  /** Indicadores + linha da vida. */
  children?: React.ReactNode;
}

const OBJETO_LIMITE = 220;

/**
 * Cartão único do topo das telas 360 (Contrato e Ata): identificação, situação
 * na mesma faixa da Carteira, gestor, objeto, dados cadastrais, indicadores e
 * linha da vida — antes espalhados em dois cartões e com a vigência repetida.
 */
export const Instrument360Hero: React.FC<Instrument360HeroProps> = ({
  backLabel,
  onBack,
  backTestId,
  actions,
  notice,
  icon,
  title,
  status,
  manager,
  subtitle,
  objeto,
  meta,
  metaTestId,
  children
}) => {
  const [objetoAberto, setObjetoAberto] = React.useState(false);
  const objetoLongo = Boolean(objeto && objeto.length > OBJETO_LIMITE);
  const statusColors = PRAZO_COLORS[status.faixa];

  return (
    <header
      style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        padding: '1.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        marginBottom: '1.5rem'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <button
          type="button"
          onClick={onBack}
          data-testid={backTestId}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.45rem 0.85rem',
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: 700,
            color: '#0c326f',
            cursor: 'pointer'
          }}
        >
          <ArrowLeft size={16} /> {backLabel}
        </button>
        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>{actions}</div>}
      </div>

      {notice}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {icon}
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>{title}</h1>
        </div>
        <span
          data-testid="instrument-360-status"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0.25rem 0.65rem',
            borderRadius: '6px',
            fontSize: '0.78rem',
            fontWeight: 800,
            color: statusColors.color,
            background: statusColors.bg
          }}
        >
          {status.label}
        </span>
        {manager && <div style={{ marginLeft: 'auto' }}>{manager}</div>}
      </div>

      {subtitle && <div style={{ marginTop: '0.35rem', fontSize: '0.88rem', color: '#334155' }}>{subtitle}</div>}

      {objeto && (
        <p style={{ fontSize: '0.92rem', color: '#334155', margin: '0.5rem 0 0 0', lineHeight: 1.45, maxWidth: '1200px' }}>
          {objetoLongo && !objetoAberto ? `${objeto.slice(0, OBJETO_LIMITE).trimEnd()}…` : objeto}
          {objetoLongo && (
            <button
              type="button"
              onClick={() => setObjetoAberto((v) => !v)}
              style={{ marginLeft: '0.4rem', background: 'none', border: 'none', padding: 0, color: '#0c326f', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
            >
              {objetoAberto ? 'ver menos' : 'ver mais'}
            </button>
          )}
        </p>
      )}

      <dl
        data-testid={metaTestId}
        style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 1.25rem', margin: '0.6rem 0 1.1rem 0', fontSize: '0.78rem', color: '#64748b' }}
      >
        {meta.map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', gap: '0.3rem' }}>
            <dt style={{ fontWeight: 600 }}>{label}:</dt>
            <dd style={{ margin: 0, color: value ? '#334155' : '#94a3b8', fontWeight: value ? 600 : 400 }}>{value || 'Não informado'}</dd>
          </div>
        ))}
      </dl>

      {children && <div style={{ paddingTop: '1.1rem', borderTop: '1px solid #f1f5f9' }}>{children}</div>}
    </header>
  );
};

/** Texto da situação no padrão da Carteira (crítico ≤30 dias, atenção 31–90). */
export function instrumentStatusLabel(faixa: PrazoFaixa, dias: number | null, cancelada = false): string {
  if (cancelada) return 'Cancelada no PNCP';
  switch (faixa) {
    case 'EXPIRADO':
      return dias !== null ? `Encerrada há ${Math.abs(dias)} dias` : 'Encerrada';
    case 'CRITICO':
      return dias === 0 ? 'Crítico · vence hoje' : `Crítico · vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
    case 'ATENCAO':
      return `Atenção · vence em ${dias} dias`;
    case 'REGULAR':
      return `Vigente · ${dias} dias restantes`;
    default:
      return 'Vigência não informada';
  }
}
