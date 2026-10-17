import React, { useMemo } from 'react';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { useAtasPortfolio } from '../../hooks/useAtasPortfolio';
import { useCarteiraItens } from '../../hooks/useCarteiraItens';
import { ROTA_ALOCACAO } from '../vinculacao/vinculacaoConfig';
import { FaixasBarra, FaixasLegenda, type FaixaDaBarra } from './GavetaSituacao';
import { AlocacoesFalhaNotice } from '../carteira/AlocacoesFalhaNotice';

/**
 * Gaveta Alocação (gestor de saldos): os itens com quantitativo SENASP das atas não encerradas, pelo quanto já foi
 * alocado às unidades internas. Mesma regra do número do menu Alocação (contarItensAAlocar) e das mesmas consultas da
 * carteira de Itens; só monta (e consulta) com a gaveta aberta.
 */
export const GavetaAlocacao: React.FC<{ onAbrir: (destino: string) => void }> = ({ onAbrir }) => {
  const { scopedArps, itemsByAta, gestorByAta, isLoading: atasLoading } = useAtasPortfolio();
  const { rows, isLoading, alocacoesComErro, recarregandoAlocacoes, recarregarAlocacoes } = useCarteiraItens({ arps: scopedArps, itemsByAta, gestorByAta, semEmpenhado: true });

  const faixas = useMemo<FaixaDaBarra[]>(() => {
    const conta = { TOTAL: 0, PARCIAL: 0, SEM: 0 };
    for (const r of rows) {
      if (r.quantitativoSenasp > 0 && r.faixa !== 'EXPIRADO') conta[r.nivelAlocacao]++;
    }
    return [
      { rotulo: 'Alocados', valor: conta.TOTAL, cor: 'pn-cor-ok', destino: `${ROTA_ALOCACAO}?alocacao=TOTAL` },
      { rotulo: 'Alocados em parte', valor: conta.PARCIAL, cor: 'pn-cor-atencao', destino: `${ROTA_ALOCACAO}?alocacao=PARCIAL` },
      { rotulo: 'Sem alocação', valor: conta.SEM, cor: 'pn-cor-critico', destino: `${ROTA_ALOCACAO}?alocacao=SEM` }
    ];
  }, [rows]);

  if (atasLoading || isLoading) return <SkeletonLoader variant="text" count={2} />;
  // Sem as alocações, todos os itens contariam como "Sem alocação".
  if (alocacoesComErro) return <AlocacoesFalhaNotice onRetry={recarregarAlocacoes} isRetrying={recarregandoAlocacoes} />;
  return (
    <div className="pn-situacao-bloco">
      <FaixasBarra titulo="Itens" faixas={faixas} onAbrir={onAbrir} testId="painel-alocacao-itens" />
      <FaixasLegenda faixas={faixas} />
    </div>
  );
};
