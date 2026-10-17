import React from 'react';
import { AnchoredPanel } from '../../design-system/components/AnchoredPanel';
import { LARGURA_BARRA_CARTEIRA } from '../carteira/carteiraStyles';
import { GRUPO_GTI_INFO, resumirCelulaGti, textoDaFatia, type FatiasDaAta, type GrupoDaFatia } from '../../config/gruposGti';

/** "A confirmar" na barra: listrado, para não se confundir com o cinza de "Outros". */
const LISTRADO = 'repeating-linear-gradient(135deg, #cbd5e1 0 3px, #f1f5f9 3px 6px)';
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

/**
 * Barra com a fatia de cada grupo (e, opcionalmente, a legenda dos grupos com 5% ou mais). Cada grupo é um pedaço
 * separado por um vão de 2px; nas carteiras e no cartão do topo fica com 4px, a mesma espessura da barra de consumo.
 */
export const GtiFatiaBar: React.FC<{ fatias: FatiasDaAta; legenda?: boolean; largura?: string; altura?: number; testId?: string }> = ({
  fatias,
  legenda = false,
  largura = '100%',
  altura = 8,
  testId
}) => {
  const descricao = fatias.fatias.map((f) => `${GRUPO_GTI_INFO[f.grupo].rotulo} ${f.pct}%`).join(' · ');
  const comLegenda = fatias.fatias.filter((f) => f.pct >= 5);
  const raio = Math.min(2, altura / 2);
  return (
    <div data-testid={testId} style={{ minWidth: 0 }}>
      <div
        role="img"
        aria-label={`Fatia por GTI: ${descricao}`}
        title={descricao}
        style={{ display: 'flex', gap: '2px', width: largura, maxWidth: '100%', height: altura, borderRadius: raio, background: fatias.total > 0 ? undefined : '#f1f5f9' }}
      >
        {fatias.total > 0 &&
          fatias.fatias.map((f) =>
            f.quantidade > 0 ? (
              <span
                key={f.grupo}
                style={{ flex: `${f.quantidade} 1 0`, minWidth: 2, borderRadius: raio, background: f.grupo === 'A_CONFIRMAR' ? LISTRADO : GRUPO_GTI_INFO[f.grupo].cor }}
              />
            ) : null
          )}
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

/**
 * Célula "GTI" das carteiras: o GTI principal em destaque, a maior outra fatia em cinza (se pesa) e a barra. Com um
 * grupo só não há divisão a mostrar: fica o nome com "único grupo" e sem barra.
 */
export const GtiCelulaAta: React.FC<{ fatias?: FatiasDaAta; testId?: string; detalheAoPassar?: boolean }> = ({ fatias, testId, detalheAoPassar = true }) => {
  const { destaque, secundaria } = resumirCelulaGti(fatias);
  const ancoraRef = React.useRef<HTMLDivElement>(null);
  const [ancora, setAncora] = React.useState<DOMRect | null>(null);

  if (!fatias || !destaque) {
    return (
      <span style={pequeno} title="Os órgãos dos itens ainda não foram copiados do Compras.gov.br" data-testid={testId}>
        Sem dados dos órgãos
      </span>
    );
  }
  const ehGti = destaque.grupo !== 'OUTROS' && destaque.grupo !== 'A_CONFIRMAR';
  const unico = fatias.fatias.filter((f) => f.quantidade > 0).length === 1;
  // O detalhe abre só com mouse: no toque, o clique da célula é o filtro.
  const comMouse = detalheAoPassar && typeof window !== 'undefined' && Boolean(window.matchMedia?.('(hover: hover)').matches);
  const abrir = () => {
    if (ancoraRef.current) setAncora(ancoraRef.current.getBoundingClientRect());
  };
  const fechar = () => setAncora(null);
  const porTamanho = [...fatias.fatias].filter((f) => f.quantidade > 0).sort((x, y) => y.quantidade - x.quantidade);

  return (
    <div
      ref={ancoraRef}
      data-testid={testId}
      onMouseEnter={comMouse ? abrir : undefined}
      onMouseLeave={comMouse ? fechar : undefined}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: '150px' }}
    >
      <div style={{ fontSize: '0.8rem', lineHeight: 1.3 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: ehGti ? 800 : 600, color: ehGti ? '#0f172a' : '#64748b', whiteSpace: 'nowrap' }}>
          {ehGti && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: GRUPO_GTI_INFO[destaque.grupo].cor }} />}
          {/* Só o nome do principal é sublinhado ao passar o mouse: é por ele que o clique filtra. */}
          <span className="gti-nome-principal">{unico && ehGti ? GRUPO_GTI_INFO[destaque.grupo].rotulo : textoDaFatia(destaque)}</span>
        </span>
        {unico && ehGti && <span style={{ ...pequeno, display: 'inline-block', whiteSpace: 'nowrap' }}>&nbsp;· único grupo</span>}
        {secundaria && <span style={{ ...pequeno, display: 'inline-block', whiteSpace: 'nowrap' }}>&nbsp;· {textoDaFatia(secundaria)}</span>}
      </div>
      {!unico && <GtiFatiaBar fatias={fatias} largura={LARGURA_BARRA_CARTEIRA} altura={4} />}
      {ancora && (
        <AnchoredPanel anchorRect={ancora} onClose={() => setAncora(null)} ariaLabel="Interesse por GTI" testId={testId ? `${testId}-detalhe` : undefined} width={300}
          // Só leitura: o mouse e o clique passam pelo quadro e chegam às linhas de baixo (o clique da célula é o filtro).
          style={{ pointerEvents: 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Interesse por GTI</div>
            {porTamanho.map((f) => (
              <div key={f.grupo} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.2rem 0.5rem', alignItems: 'center', fontSize: '0.8rem' }}>
                <span style={{ justifySelf: 'start' }}><GtiTag grupo={f.grupo} /></span>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{f.pct}%</b>
                <span style={{ gridColumn: '1 / 3', display: 'block', height: 4, borderRadius: 2, background: '#f1f5f9', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${Math.min(100, f.pct)}%`, background: f.grupo === 'A_CONFIRMAR' ? LISTRADO : GRUPO_GTI_INFO[f.grupo].cor }} />
                </span>
              </div>
            ))}
          </div>
        </AnchoredPanel>
      )}
    </div>
  );
};
