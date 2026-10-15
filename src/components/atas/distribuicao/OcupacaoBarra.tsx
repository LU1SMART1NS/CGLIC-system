import React from 'react';
import { PESO_COMPLEXIDADE, ROTULO_COMPLEXIDADE, type NivelComplexidade } from './complexidade';
import { percentual } from './nivelGestor';
import type { DistribuicaoLinha } from './distribuicaoEquipe';

/** Cores das faixas de complexidade (barra de ocupação). */
export const COR_COMPLEXIDADE: Record<NivelComplexidade, string> = { ALTA: 'var(--primary)', MEDIA: '#5b8bd6', BAIXA: '#c7d7f0' };
const NIVEIS: NivelComplexidade[] = ['ALTA', 'MEDIA', 'BAIXA'];
const RELACAO_ROTULO = { ACIMA: 'Acima da média', NA_MEDIA: 'Na média', ABAIXO: 'Abaixo da média' } as const;

/** Régua comum às barras de uma lista: a maior ocupação (ou a média) ocupa quase toda a largura. */
export function escalaDeOcupacao(linhas: DistribuicaoLinha[], media: number | null): number {
  return Math.max(0, ...linhas.map((l) => l.ocupacao), media ?? 0) * 1.1;
}

/**
 * Ocupação e complexidade numa barra só: o tamanho é a ocupação (carga ÷ capacidade do nível), dividida pelo peso de
 * cada complexidade; o tracejado marca a média da equipe. Sem número: a palavra já diz a situação. Mesma barra da coluna
 * Ocupação da Central de Distribuição e dos cartões do Início.
 */
export const OcupacaoBarra: React.FC<{ l: DistribuicaoLinha; escala: number; media: number | null; minWidth?: string }> = ({ l, escala, media, minWidth = '190px' }) => {
  const largura = escala > 0 ? Math.min(l.ocupacao / escala, 1) * 100 : 0;
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth }}
      title={`A barra mostra a ocupação (carga ÷ capacidade do nível ${percentual(l.capacidade)}), dividida pelo peso de cada complexidade. O tracejado é a média da equipe.`}
    >
      {l.relacaoEquipe && (
        <span
          data-testid={`distribuicao-relacao-${l.gestorNome}`}
          style={{ fontSize: '0.78rem', fontWeight: 800, color: l.relacaoEquipe === 'ACIMA' ? 'var(--color-danger-text)' : '#475569', whiteSpace: 'nowrap' }}
        >
          {RELACAO_ROTULO[l.relacaoEquipe]}
        </span>
      )}
      <div style={{ position: 'relative', height: '10px', background: '#f1f5f9', borderRadius: '3px' }} aria-hidden="true">
        <div style={{ display: 'flex', gap: '1px', height: '100%', width: `${largura}%`, borderRadius: '3px', overflow: 'hidden' }}>
          {NIVEIS.map((n) => (
            <div key={n} style={{ flex: l.complexidade[n] * PESO_COMPLEXIDADE[n], background: COR_COMPLEXIDADE[n] }} />
          ))}
        </div>
        {media !== null && escala > 0 && (
          <span style={{ position: 'absolute', top: '-3px', bottom: '-3px', left: `${Math.min(media / escala, 1) * 100}%`, borderLeft: '2px dashed #64748b' }} />
        )}
      </div>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
        {NIVEIS.map((n) => `${l.complexidade[n]} ${ROTULO_COMPLEXIDADE[n]}`).join(' · ')}
      </div>
    </div>
  );
};
