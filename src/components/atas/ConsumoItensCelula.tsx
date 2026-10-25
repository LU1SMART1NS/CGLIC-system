import React from 'react';
import { AnchoredPanel } from '../../design-system/components/AnchoredPanel';
import { saldoBarColor } from './ataSaldoStats';
import { ESPACO_ATE_A_BARRA, LARGURA_BARRA_CARTEIRA, LINHA_ACIMA_DA_BARRA } from '../carteira/carteiraStyles';
import { descricaoItemEmFrase } from '../../utils/textCase';

export interface ConsumoItem {
  numero: string;
  descricao: string;
  pct: number;
}

const fmtPct = (pct: number) => `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
const rotuloItem = (numero: string) => `Item ${Number(numero) || numero}`;

const Barra: React.FC<{ pct: number; altura: number; largura?: string }> = ({ pct, altura, largura }) => (
  <span style={{ display: 'block', width: largura, maxWidth: '100%', height: `${altura}px`, background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
    <span style={{ display: 'block', width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: saldoBarColor(pct) }} />
  </span>
);

/**
 * Coluna de consumo da Carteira de Atas: porcentagem e descrição do item mais consumido. Passar o mouse (ou
 * tocar) abre a lista de todos os itens com a porcentagem.
 */
export const ConsumoItensCelula: React.FC<{ itens: ConsumoItem[]; testId?: string }> = ({ itens, testId }) => {
  const ordenados = React.useMemo(() => [...itens].sort((a, b) => b.pct - a.pct), [itens]);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = React.useState<DOMRect | null>(null);
  // Aberta por clique/toque fica até novo clique (no toque o mouseenter chega antes do clique).
  const [fixado, setFixado] = React.useState(false);
  const fecharTimer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => () => window.clearTimeout(fecharTimer.current), []);

  if (ordenados.length === 0) return <span style={{ color: '#94a3b8' }}>—</span>;

  const topo = ordenados[0];
  const total = ordenados.length;
  const mouse = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;

  const abrir = () => {
    window.clearTimeout(fecharTimer.current);
    if (btnRef.current) setAnchor(btnRef.current.getBoundingClientRect());
  };
  const fechar = () => {
    window.clearTimeout(fecharTimer.current);
    setAnchor(null);
    setFixado(false);
  };
  const fecharDepois = () => {
    if (fixado) return;
    window.clearTimeout(fecharTimer.current);
    fecharTimer.current = window.setTimeout(() => setAnchor(null), 180);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-testid={testId}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        aria-label={`Consumo dos itens: maior ${fmtPct(topo.pct)}. Ver os ${total === 1 ? 'detalhes' : `${total} itens`}`}
        onClick={() => {
          if (fixado) fechar();
          else {
            abrir();
            setFixado(true);
          }
        }}
        onMouseEnter={mouse ? abrir : undefined}
        onMouseLeave={mouse ? fecharDepois : undefined}
        style={{ display: 'block', width: LARGURA_BARRA_CARTEIRA, background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}
      >
        <span style={{ ...LINHA_ACIMA_DA_BARRA, fontWeight: 800 }}>{fmtPct(topo.pct)}</span>
        <span style={{ display: 'block', marginTop: ESPACO_ATE_A_BARRA }}><Barra pct={topo.pct} altura={4} largura={LARGURA_BARRA_CARTEIRA} /></span>
        <span
          data-testid={testId ? `${testId}-descricao` : undefined}
          style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginTop: '0.3rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {total > 1 && <strong style={{ color: '#334155' }}>{rotuloItem(topo.numero)} · </strong>}
          {descricaoItemEmFrase(topo.descricao)}
        </span>
      </button>
      {anchor && (
        <AnchoredPanel anchorRect={anchor} onClose={fechar} ariaLabel="Consumo dos itens da ata" testId={testId ? `${testId}-lista` : undefined} width={380}>
          <div onMouseEnter={mouse ? abrir : undefined} onMouseLeave={mouse ? fecharDepois : undefined} style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {total} {total === 1 ? 'item' : 'itens'}, do mais ao menos consumido
            </div>
            {ordenados.map((item) => (
              <div key={item.numero} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.15rem 0.5rem', fontSize: '0.8rem' }}>
                <span title={item.descricao} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <strong>{rotuloItem(item.numero)}</strong> · {descricaoItemEmFrase(item.descricao)}
                </span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{fmtPct(item.pct)}</span>
                <span style={{ gridColumn: '1 / 3' }}><Barra pct={item.pct} altura={4} /></span>
              </div>
            ))}
          </div>
        </AnchoredPanel>
      )}
    </>
  );
};
