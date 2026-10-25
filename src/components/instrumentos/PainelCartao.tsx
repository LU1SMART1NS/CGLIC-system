import React from 'react';

export type PainelCartaoTom = 'primary' | 'success' | 'amber' | 'danger';

/** Cor do chip do ícone e do número grande, por tom (as mesmas dos quatro cartões do Painel). */
const TOM: Record<PainelCartaoTom, { chipFundo: string; chipCor: string; valor: string; bordaAtiva: string }> = {
  primary: { chipFundo: 'var(--color-info-bg)', chipCor: 'var(--primary)', valor: 'var(--primary)', bordaAtiva: 'var(--primary)' },
  success: { chipFundo: '#ecfdf5', chipCor: 'var(--color-success)', valor: 'var(--color-success)', bordaAtiva: 'var(--primary)' },
  amber: { chipFundo: '#fef9c3', chipCor: '#a16207', valor: '#a16207', bordaAtiva: 'var(--primary)' },
  danger: { chipFundo: 'var(--color-danger-bg)', chipCor: 'var(--color-danger)', valor: 'var(--color-danger)', bordaAtiva: 'var(--color-danger)' }
};

export interface PainelCartaoLinha {
  rotulo: React.ReactNode;
  valor: React.ReactNode;
  /** Valor em vermelho ou âmbar quando pede atenção; sem tom, preto. */
  tom?: 'danger' | 'warning';
}

export interface PainelCartaoProps {
  /** Rótulo em maiúsculas no alto do cartão (ex.: "Atas de Registro de Preço (ARP)"). */
  rotulo: string;
  icone: React.ReactNode;
  tom: PainelCartaoTom;
  /** Número grande. */
  valor: React.ReactNode;
  /** Palavra pequena ao lado do número ("geridas", "pedidos", "un."). */
  unidade?: string;
  /** Linhas rótulo/valor embaixo do número, até três. */
  linhas?: PainelCartaoLinha[];
  /** Cartão escolhido (filtra a lista abaixo): borda de 2px. */
  ativo?: boolean;
  onClick: () => void;
  testId: string;
  /** O que mais couber embaixo das linhas (ex.: barra fina). */
  children?: React.ReactNode;
}

const cardBaseStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  padding: '1.1rem 1.25rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.6rem',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'all 0.15s ease-in-out',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
  minWidth: 0,
  font: 'inherit',
  color: 'inherit'
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  fontSize: '0.78rem',
  color: '#64748b'
};

const COR_DA_LINHA: Record<NonNullable<PainelCartaoLinha['tom']>, string> = { danger: 'var(--color-danger)', warning: 'var(--color-warning)' };

/**
 * Cartão de resumo do Início (o mesmo desenho dos quatro cartões do Painel do coordenador): rótulo em maiúsculas com o
 * chip do ícone à direita, número grande colorido com a palavra ao lado e até três linhas rótulo/valor. O cartão
 * inteiro é um botão: no Painel filtra a lista; no Início de Emendas abre a tela certa.
 */
export const PainelCartao: React.FC<PainelCartaoProps> = ({ rotulo, icone, tom, valor, unidade, linhas = [], ativo = false, onClick, testId, children }) => {
  const t = TOM[tom];
  return (
    <button type="button" onClick={onClick} data-testid={testId} style={{ ...cardBaseStyle, border: ativo ? `2px solid ${t.bordaAtiva}` : cardBaseStyle.border }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{rotulo}</span>
        <div style={{ background: t.chipFundo, color: t.chipCor, padding: '0.35rem', borderRadius: '6px', display: 'flex', flex: 'none' }} aria-hidden="true">
          {icone}
        </div>
      </div>
      <div style={{ fontSize: '1.6rem', fontWeight: 900, color: t.valor, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
        {valor}
        {unidade && <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b', letterSpacing: 0 }}> {unidade}</span>}
      </div>
      {linhas.map((l, i) => (
        <div key={i} style={rowStyle}>
          <span>{l.rotulo}</span>
          <strong style={{ color: l.tom ? COR_DA_LINHA[l.tom] : '#0f172a', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{l.valor}</strong>
        </div>
      ))}
      {children}
    </button>
  );
};

/** Grade dos cartões do Início: tantos por linha quantos couberem com 250px. */
export const PainelCartoes: React.FC<{ children: React.ReactNode; testId?: string }> = ({ children, testId }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '0.9rem' }} data-testid={testId}>
    {children}
  </div>
);
