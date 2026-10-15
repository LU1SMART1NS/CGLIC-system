import React from 'react';
import { GavetaDistribuicao, type OcupacoesDaEquipe } from './GavetaDistribuicao';
import type { ResumoDoGestor } from './painelResumo';
import { usePendenciasVinculoAta } from '../atas/distribuicao/usePendenciasVinculoAta';
import { useDistribuicaoDaCarteira } from '../atas/distribuicao/useDistribuicaoDaCarteira';
import { useCapacidadeDosGestores } from '../atas/distribuicao/useCapacidadeDosGestores';
import { useComplexidadeAjustes } from '../../hooks/useComplexidadeAjustes';
import { escalaDeOcupacao } from '../atas/distribuicao/OcupacaoBarra';

/**
 * Gaveta Distribuição do Início com a barra de ocupação da Central: usa a mesma conta (carteira de atas e contratos,
 * ajustes de complexidade e nível de cada gestor). Só existe com a gaveta aberta, então a carteira só é lida nessa hora.
 * Enquanto carrega, os cartões usam a barra por quantidade.
 */
export const GavetaDistribuicaoConectada: React.FC<{
  linhas: ResumoDoGestor[];
  isLoading: boolean;
  onEscolherGestor: (nome: string) => void;
  onDistribuir: () => void;
}> = (props) => {
  const { atas, contratos, links, isBusy } = usePendenciasVinculoAta();
  const { data: ajustes } = useComplexidadeAjustes();
  const { capacidadeDoGestor } = useCapacidadeDosGestores();
  const distribuicao = useDistribuicaoDaCarteira({ atas, contratos, links, ajustes, capacidadeDoGestor });

  const ocupacoes = React.useMemo<OcupacoesDaEquipe | null>(() => {
    if (isBusy) return null;
    const comGestor = distribuicao.linhas.filter((l) => l.gestorNome !== null);
    const mapa = new Map(comGestor.map((l) => [l.gestorNome as string, l]));
    return { linhas: mapa, media: distribuicao.totais.mediaOcupacao, escala: escalaDeOcupacao(comGestor, distribuicao.totais.mediaOcupacao) };
  }, [isBusy, distribuicao]);

  return <GavetaDistribuicao {...props} ocupacoes={ocupacoes} />;
};
