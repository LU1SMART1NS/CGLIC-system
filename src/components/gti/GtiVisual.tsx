import React from 'react';
import { GRUPO_GTI_INFO, type FatiasDaAta, type GrupoDaFatia } from '../../config/gruposGti';

const pequeno: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', fontVariantNumeric: 'tabular-nums' };

/** Etiqueta do grupo: bolinha da cor do GTI + nome. "A confirmar" fica em cinza, sem cor. */
export const GtiTag: React.FC<{ grupo: GrupoDaFatia; sufixo?: string; testId?: string }> = ({ grupo, sufixo, testId }) => {
  const info = GRUPO_GTI_INFO[grupo];
  const confirmar = grupo === 'A_CONFIRMAR';
  return (
    <span
      data-testid={testId}
      title={info.descricao}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.1rem 0.5rem',
        borderRadius: '999px',
        border: '1px solid #e2e8f0',
        background: '#f8fafc',
        fontSize: '0.75rem',
        fontWeight: 800,
        color: confirmar ? '#64748b' : '#0f172a',
        whiteSpace: 'nowrap'
      }}
    >
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: info.cor, border: confirmar ? '1px dashed #94a3b8' : undefined }} />
      {info.rotulo}
      {sufixo && <span style={{ fontWeight: 600, color: '#64748b' }}>{sufixo}</span>}
    </span>
  );
};

/** Barra com a fatia de cada grupo (e, opcionalmente, a legenda dos grupos com 5% ou mais). */
export const GtiFatiaBar: React.FC<{ fatias: FatiasDaAta; legenda?: boolean; largura?: string; testId?: string }> = ({
  fatias,
  legenda = false,
  largura = '100%',
  testId
}) => {
  const descricao = fatias.fatias.map((f) => `${GRUPO_GTI_INFO[f.grupo].rotulo} ${f.pct}%`).join(' · ');
  const comLegenda = fatias.fatias.filter((f) => f.pct >= 5);
  return (
    <div data-testid={testId} style={{ minWidth: 0 }}>
      <div
        role="img"
        aria-label={`Fatia por GTI: ${descricao}`}
        title={descricao}
        style={{ display: 'flex', width: largura, maxWidth: '100%', height: 7, borderRadius: 4, overflow: 'hidden', background: '#f1f5f9' }}
      >
        {fatias.total > 0 &&
          fatias.fatias.map((f) => (f.quantidade > 0 ? <span key={f.grupo} style={{ width: `${(100 * f.quantidade) / fatias.total}%`, background: GRUPO_GTI_INFO[f.grupo].cor }} /> : null))}
      </div>
      {legenda && comLegenda.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.15rem 0.6rem', marginTop: '0.25rem' }}>
          {comLegenda.map((f) => (
            <span key={f.grupo} style={pequeno}>
              <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 4, background: GRUPO_GTI_INFO[f.grupo].cor }} />
              {GRUPO_GTI_INFO[f.grupo].curto} {f.pct}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

/** Célula "GTI" da carteira: interesse principal + barra. Sem órgãos copiados, um traço. */
export const GtiCelulaAta: React.FC<{ fatias?: FatiasDaAta; testId?: string }> = ({ fatias, testId }) => {
  if (!fatias || fatias.fatias.length === 0) {
    return <span style={{ color: '#94a3b8' }} title="Os órgãos dos itens desta ata ainda não foram copiados do Compras.gov.br">—</span>;
  }
  return (
    <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: '150px' }}>
      {fatias.principal ? (
        <GtiTag grupo={fatias.principal.grupo} sufixo={`${fatias.principal.pct}%`} />
      ) : (
        <span style={pequeno}>{fatias.orgaosAConfirmar > 0 ? 'Grupos a confirmar' : 'Sem GTI'}</span>
      )}
      <GtiFatiaBar fatias={fatias} largura="150px" />
    </div>
  );
};
