import React from 'react';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { formatNumber } from '../../utils/format';
import { organizarCartoesDistribuicao, type ResumoDoGestor, type ResumoDoLado } from './painelResumo';
import { OcupacaoBarra } from '../atas/distribuicao/OcupacaoBarra';
import type { DistribuicaoLinha } from '../atas/distribuicao/distribuicaoEquipe';

/** Ocupação de cada gestor, calculada como na Central de Distribuição (pelo nome do gestor). */
export interface OcupacoesDaEquipe {
  linhas: Map<string, DistribuicaoLinha>;
  media: number | null;
  /** Régua comum a todas as barras. */
  escala: number;
}

const plural = (n: number, um: string, varios: string) => `${formatNumber(n)} ${n === 1 ? um : varios}`;

/** Um lado do cartão (Atas ou Contratos): o total e só as pendências que existem (zeros não aparecem). */
const Lado: React.FC<{ rotulo: string; lado: ResumoDoLado; comCriticas: boolean }> = ({ rotulo, lado, comCriticas }) => (
  <span className="pn-gc-lado">
    <span className="pn-gc-rotulo">{rotulo}</span>
    <span className="pn-gc-num">{formatNumber(lado.total)}</span>
    <span className="pn-gc-tags">
      {lado.vencem90 > 0 && <span className="pn-gc-tag pn-gc-tag--atencao">{plural(lado.vencem90, 'vence', 'vencem')}</span>}
      {comCriticas && lado.criticas > 0 && <span className="pn-gc-tag pn-gc-tag--critico">{plural(lado.criticas, 'crítica', 'críticas')}</span>}
    </span>
  </span>
);

/** O cartão clicável (um só botão para o "Sem gestor" e para os gestores). */
const Cartao: React.FC<{ sem?: boolean; onClick: () => void; rotulo: string; testId: string; children: React.ReactNode }> = ({ sem, onClick, rotulo, testId, children }) => (
  <button type="button" className={sem ? 'pn-gcard pn-gcard--sem' : 'pn-gcard'} onClick={onClick} aria-label={rotulo} data-testid={testId}>
    {children}
  </button>
);

/**
 * Gaveta Distribuição (coordenador e consulta). "Sem gestor" vem primeiro e abre a Distribuição. Depois, um cartão por
 * gestor, com as pendências críticas no cabeçalho, as atas e os contratos vigentes (e quantos vencem em 90 dias) e uma
 * barra de ocupação, a mesma da coluna Ocupação da Central (carga ajustada ao nível, por complexidade, com a média da
 * equipe); sem ela, a barra mostra a carga em relação à maior carteira. Ordem: mais críticas, depois a maior carteira.
 * Gestor sem carteira vai para uma linha no rodapé. O cartão do gestor filtra o painel pela carteira dele.
 */
export const GavetaDistribuicao: React.FC<{
  linhas: ResumoDoGestor[];
  isLoading: boolean;
  onEscolherGestor: (nome: string) => void;
  onDistribuir: () => void;
  ocupacoes?: OcupacoesDaEquipe | null;
}> = ({ linhas, isLoading, onEscolherGestor, onDistribuir, ocupacoes }) => {
  if (isLoading) return <SkeletonLoader variant="card" height="88px" />;
  const { semGestor, gestores, semCarteira } = organizarCartoesDistribuicao(linhas);
  return (
    <div className="pn-gdist">
      <div className="pn-gcards" data-testid="painel-distribuicao-cartoes">
        {semGestor && (
          <Cartao sem onClick={onDistribuir} rotulo="Sem gestor: abrir a Distribuição" testId="painel-distribuicao-sem-gestor">
            <span className="pn-gc-head">
              <strong>Sem gestor</strong>
              <span className="pn-gc-ir" aria-hidden="true">Distribuir ›</span>
            </span>
            <span className="pn-gc-corpo">
              {semGestor.atas.total > 0 && <Lado rotulo="Atas" lado={semGestor.atas} comCriticas />}
              {semGestor.contratos.total > 0 && <Lado rotulo="Contratos" lado={semGestor.contratos} comCriticas />}
            </span>
          </Cartao>
        )}
        {gestores.map((g) => (
          <Cartao
            key={g.gestor.userId}
            onClick={() => onEscolherGestor(g.gestor.nome)}
            rotulo={`${g.gestor.nome}: ver o painel com a carteira deste gestor`}
            testId="painel-distribuicao-gestor"
          >
            <span className="pn-gc-head">
              <strong>
                {g.criticas > 0 && <span className="pn-gc-ponto" aria-hidden="true" />}
                {g.gestor.nome}
              </strong>
              {g.criticas > 0 ? (
                <span className="pn-gc-criticas">{plural(g.criticas, 'crítica', 'críticas')}</span>
              ) : (
                <span className="pn-gc-ir" aria-hidden="true">›</span>
              )}
            </span>
            <span className="pn-gc-corpo">
              <Lado rotulo="Atas" lado={g.atas} comCriticas={false} />
              <Lado rotulo="Contratos" lado={g.contratos} comCriticas={false} />
            </span>
            {(() => {
              const ocupacao = ocupacoes?.linhas.get(g.gestor.nome);
              return ocupacao && ocupacoes ? (
                <span className="pn-gc-carga" data-testid="painel-distribuicao-ocupacao">
                  <OcupacaoBarra l={ocupacao} escala={ocupacoes.escala} media={ocupacoes.media} minWidth="0" />
                </span>
              ) : (
                <span className="pn-gc-carga">
                  <span className="pn-gc-barra" aria-hidden="true">
                    <span style={{ width: `${Math.max(2, g.pctDaMaior)}%` }} />
                  </span>
                  <span className="pn-gc-carga-texto">
                    {plural(g.carga, 'instrumento', 'instrumentos')}
                    {g.maiorCarteira && gestores.length > 1 ? ' · maior carteira' : ''}
                  </span>
                </span>
              );
            })()}
          </Cartao>
        ))}
      </div>
      {semCarteira.length > 0 && (
        <p className="pn-gc-sem-carteira" data-testid="painel-distribuicao-sem-carteira">
          Sem carteira: {semCarteira.join(', ')}
        </p>
      )}
    </div>
  );
};
