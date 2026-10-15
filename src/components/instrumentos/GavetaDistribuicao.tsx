import React from 'react';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { formatNumber } from '../../utils/format';
import type { ResumoDoGestor, ResumoDoLado } from './painelResumo';

const plural = (n: number, um: string, varios: string) => `${formatNumber(n)} ${n === 1 ? um : varios}`;

const Lado: React.FC<{ rotulo: string; lado: ResumoDoLado }> = ({ rotulo, lado }) => (
  <span className="pn-gc-lado">
    <span className="pn-gc-rotulo">{rotulo}</span>
    <span className="pn-gc-num">{formatNumber(lado.total)}</span>
    <span className="pn-gc-tags">
      <span className={lado.vencem90 ? 'pn-gc-tag pn-gc-tag--atencao' : 'pn-gc-tag'}>{plural(lado.vencem90, 'vence', 'vencem')}</span>
      <span className={lado.criticas ? 'pn-gc-tag pn-gc-tag--critico' : 'pn-gc-tag'}>{plural(lado.criticas, 'crítica', 'críticas')}</span>
    </span>
  </span>
);

/**
 * Gaveta Distribuição (coordenador e consulta): um cartão por gestor com as atas e os contratos vigentes da carteira
 * dele, quantos vencem em 90 dias e quantas pendências críticas cada lado tem. O cartão do gestor filtra o painel pela
 * carteira dele; o cartão "Sem gestor" abre a Distribuição.
 */
export const GavetaDistribuicao: React.FC<{
  linhas: ResumoDoGestor[];
  isLoading: boolean;
  onEscolherGestor: (nome: string) => void;
  onDistribuir: () => void;
}> = ({ linhas, isLoading, onEscolherGestor, onDistribuir }) => {
  if (isLoading) return <SkeletonLoader variant="card" height="88px" />;
  return (
    <div className="pn-gcards" data-testid="painel-distribuicao-cartoes">
      {linhas.map((l) => {
        const sem = !l.gestor;
        if (sem && l.atas.total === 0 && l.contratos.total === 0) return null;
        const nome = l.gestor?.nome ?? 'Sem gestor';
        return (
          <button
            key={l.gestor?.userId ?? 'sem-gestor'}
            type="button"
            className={sem ? 'pn-gcard pn-gcard--sem' : 'pn-gcard'}
            onClick={() => (l.gestor ? onEscolherGestor(l.gestor.nome) : onDistribuir())}
            aria-label={sem ? 'Sem gestor: abrir a Distribuição' : `${nome}: ver o painel com a carteira deste gestor`}
            data-testid={sem ? 'painel-distribuicao-sem-gestor' : 'painel-distribuicao-gestor'}
          >
            <span className="pn-gc-head">
              <strong>{nome}</strong>
              <span className="pn-gc-ir" aria-hidden="true">{sem ? 'Distribuir ›' : '›'}</span>
            </span>
            <span className="pn-gc-corpo">
              <Lado rotulo="Atas" lado={l.atas} />
              <Lado rotulo="Contratos" lado={l.contratos} />
            </span>
          </button>
        );
      })}
    </div>
  );
};
