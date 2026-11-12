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

export type RelacaoComAEquipe = 'ACIMA' | 'NA_MEDIA' | 'ABAIXO';

/**
 * Barra de ocupação comum a todas as Distribuições (Central, Início de Atas e Contratos, Fiscalização): "Acima/Na
 * média/Abaixo da média", a barra do tamanho da ocupação (dividida em partes coloridas, se houver) e o tracejado da média
 * da equipe, só em quem é comparado a ela. Sem número: a palavra já diz a situação.
 */
export const BarraDeOcupacao: React.FC<{
  ocupacao: number;
  relacao: RelacaoComAEquipe | null;
  escala: number;
  media: number | null;
  /** Partes da barra (peso e cor); sem partes, uma cor só. */
  partes?: Array<{ chave: string; peso: number; cor: string }>;
  rodape: React.ReactNode;
  title: string;
  testId?: string;
  minWidth?: string;
}> = ({ ocupacao, relacao, escala, media, partes, rodape, title, testId, minWidth = '190px' }) => {
  const largura = escala > 0 ? Math.min(ocupacao / escala, 1) * 100 : 0;
  const pedacos = partes && partes.some((p) => p.peso > 0) ? partes : [{ chave: 'total', peso: 1, cor: 'var(--primary)' }];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth }} title={title}>
      {relacao && (
        <span data-testid={testId} style={{ fontSize: '0.78rem', fontWeight: 800, color: relacao === 'ACIMA' ? 'var(--color-danger-text)' : '#475569', whiteSpace: 'nowrap' }}>
          {RELACAO_ROTULO[relacao]}
        </span>
      )}
      <div style={{ position: 'relative', height: '10px', background: '#f1f5f9', borderRadius: '3px' }} aria-hidden="true">
        <div style={{ display: 'flex', gap: '1px', height: '100%', width: `${largura}%`, borderRadius: '3px', overflow: 'hidden' }}>
          {pedacos.map((p) => (
            <div key={p.chave} style={{ flex: p.peso, background: p.cor }} />
          ))}
        </div>
        {media !== null && relacao !== null && escala > 0 && (
          <span style={{ position: 'absolute', top: '-3px', bottom: '-3px', left: `${Math.min(media / escala, 1) * 100}%`, borderLeft: '2px dashed #64748b' }} />
        )}
      </div>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>{rodape}</div>
    </div>
  );
};

/**
 * Ocupação e complexidade numa barra só: o tamanho é a ocupação (carga ÷ capacidade do nível), dividida pelo peso de
 * cada complexidade; o tracejado marca a média da equipe. Mesma barra da coluna Ocupação da Central de Distribuição,
 * dos cartões do Início e da Distribuição da Fiscalização (BarraDeOcupacao).
 */
export const OcupacaoBarra: React.FC<{ l: DistribuicaoLinha; escala: number; media: number | null; minWidth?: string }> = ({ l, escala, media, minWidth }) => (
  <BarraDeOcupacao
    ocupacao={l.ocupacao}
    relacao={l.relacaoEquipe}
    escala={escala}
    media={media}
    partes={NIVEIS.map((n) => ({ chave: n, peso: l.complexidade[n] * PESO_COMPLEXIDADE[n], cor: COR_COMPLEXIDADE[n] }))}
    rodape={NIVEIS.map((n) => `${l.complexidade[n]} ${ROTULO_COMPLEXIDADE[n]}`).join(' · ')}
    title={`A barra mostra a ocupação (carga ÷ capacidade ${percentual(l.capacidade)}), dividida pelo peso de cada complexidade. O tracejado é a média da equipe.`}
    testId={`distribuicao-relacao-${l.gestorNome}`}
    minWidth={minWidth}
  />
);
