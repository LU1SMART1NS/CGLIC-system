import React from 'react';
import { ChevronDown } from 'lucide-react';
import { ActionButton } from '../../design-system';
import { formatCurrencyCompact, formatNumber } from '../../utils/format';
import { GtiCelulaAta, GtiFatiaBar, GtiTag } from './GtiVisual';
import { GRUPO_GTI_INFO, type FatiasDaAta } from '../../config/gruposGti';

const pequeno: React.CSSProperties = { fontSize: '0.8rem', color: 'var(--text-muted)' };

/** Explicação da gaveta: no item, unidades; na ata (vários itens), valor. */
export const EXPLICACAO_GTI = {
  item: 'Quanto cada grupo pediu neste item: a soma da quantidade registrada dos órgãos participantes. Não entram a SENASP, o órgão que gerencia a ata nem os órgãos que aderiram depois.',
  ata: 'Quanto cada grupo pediu nesta ata, em valor: a quantidade registrada dos órgãos participantes vezes o valor unitário de cada item, somada por grupo. Não entram a SENASP, o órgão que gerencia a ata nem os órgãos que aderiram depois.'
} as const;

/**
 * "Interesse por GTI:" com um botão no padrão dos botões de gaveta do Início. Fica no cartão do topo do item e da ata e mostra a
 * mesma célula da coluna GTI das carteiras (principal em destaque, a segunda fatia em cinza e a barra).
 */
export const InteresseGtiBotao: React.FC<{ fatias: FatiasDaAta | undefined; aberto: boolean; onToggle: () => void }> = ({ fatias, aberto, onToggle }) => {
  if (!fatias || fatias.fatias.length === 0) return null;
  return (
    <div className="pn-gavetas" role="group" aria-label="Interesse por GTI" data-testid="interesse-gti-botoes" style={{ marginTop: '12px' }}>
      <span className="pn-gavetas-lbl">Interesse por GTI:</span>
      <button
        type="button"
        className="pn-gaveta-btn"
        aria-expanded={aberto}
        aria-controls="gaveta-interesse-gti"
        onClick={onToggle}
        aria-label={`Interesse por GTI: ${fatias.fatias.map((f) => `${GRUPO_GTI_INFO[f.grupo].rotulo} ${f.pct}%`).join(', ')}`}
        title={aberto ? 'Fechar o interesse por GTI' : 'Abrir o interesse por GTI'}
        data-testid="interesse-gti-btn"
      >
        <span style={{ display: 'inline-flex', background: '#ffffff', borderRadius: 6, padding: '3px 8px', fontWeight: 400, textAlign: 'left' }}>
          <GtiCelulaAta fatias={fatias} testId="interesse-gti-resumo" />
        </span>
        <ChevronDown size={16} className="pn-gaveta-seta" aria-hidden="true" />
      </button>
    </div>
  );
};

/**
 * Gaveta aberta com a fatia de cada grupo. Na ata a fatia é pelo valor (R$, migration 141); no item, por unidades.
 */
export const InteresseGtiGaveta: React.FC<{ fatias: FatiasDaAta; onFechar: () => void; explicacao: string }> = ({ fatias, onFechar, explicacao }) => {
  if (fatias.fatias.length === 0) return null;
  const emValor = fatias.medida === 'VALOR';
  return (
    <section id="gaveta-interesse-gti" className="pn-gaveta" aria-labelledby="gaveta-interesse-gti-titulo" data-testid="interesse-gti">
      <div className="pn-gaveta-head">
        <h2 id="gaveta-interesse-gti-titulo">Interesse por GTI</h2>
        <span className="pn-gaveta-sub">{explicacao}</span>
        <ActionButton action="fechar" size="sm" onClick={onFechar} data-testid="interesse-gti-fechar" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <GtiFatiaBar fatias={fatias} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem' }}>
          {fatias.fatias.map((f) => (
            <span key={f.grupo} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
              <GtiTag grupo={f.grupo} />
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>{f.pct}%</b>
              <span style={pequeno}>
                {emValor ? formatCurrencyCompact(f.quantidade) : `${formatNumber(f.quantidade)} un`} · {f.orgaos} {f.orgaos === 1 ? 'órgão' : 'órgãos'}
              </span>
            </span>
          ))}
        </div>
        {fatias.orgaosAConfirmar > 0 && (
          <span style={pequeno}>
            {fatias.orgaosAConfirmar} {fatias.orgaosAConfirmar === 1 ? 'órgão ainda sem grupo confirmado' : 'órgãos ainda sem grupo confirmado'}: o coordenador
            confirma em Ajustes › Grupos das UASGs.
          </span>
        )}
        {fatias.principal && (
          <span style={{ ...pequeno, color: 'var(--text-secondary)' }}>
            Interesse principal: <b>{GRUPO_GTI_INFO[fatias.principal.grupo].rotulo}</b> ({GRUPO_GTI_INFO[fatias.principal.grupo].descricao}).
          </span>
        )}
      </div>
    </section>
  );
};

/**
 * A gaveta entre o cartão do topo e as abas (dentro do bloco do topo): some junto com o cartão quando ele encolhe ao
 * rolar. Mesma moldura no Item 360 e na Ata 360.
 */
export const InteresseGtiNoTopo: React.FC<{ fatias: FatiasDaAta | undefined; aberto: boolean; onFechar: () => void; explicacao: string }> = ({
  fatias,
  aberto,
  onFechar,
  explicacao
}) => {
  if (!aberto || !fatias || fatias.fatias.length === 0) return null;
  return (
    <div className="i360-fold" data-i360-fold="">
      <div className="i360-fold-in">
        <div style={{ marginBottom: '1.5rem' }}>
          <InteresseGtiGaveta fatias={fatias} onFechar={onFechar} explicacao={explicacao} />
        </div>
      </div>
    </div>
  );
};
