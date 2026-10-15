import React from 'react';
import { SALDO_RULES, VIGENCIA_RULES } from '../../config/alertRules';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { formatNumber } from '../../utils/format';
import type { FaixasDePrazo } from './painelResumo';

export interface FaixaDaBarra {
  rotulo: string;
  valor: number;
  /** Classe de cor: pn-cor-ok, pn-cor-atencao, pn-cor-critico, pn-cor-neutro... */
  cor: string;
  /** Para onde o clique no trecho leva (a carteira já filtrada). */
  destino: string;
}

/** Barra dividida em trechos proporcionais; cada trecho abre os registros dele. */
export const FaixasBarra: React.FC<{
  titulo: string;
  faixas: FaixaDaBarra[];
  onAbrir: (destino: string) => void;
  testId: string;
}> = ({ titulo, faixas, onAbrir, testId }) => {
  const total = faixas.reduce((a, f) => a + f.valor, 0);
  return (
    <div className="pn-barra-linha" data-testid={testId}>
      <span className="pn-barra-rotulo">
        {titulo} <strong>{formatNumber(total)}</strong>
      </span>
      <div className="pn-barra" role="group" aria-label={titulo}>
        {faixas
          .filter((f) => f.valor > 0)
          .map((f) => (
            <button
              key={f.rotulo}
              type="button"
              className={`pn-barra-trecho ${f.cor}`}
              style={{ flexGrow: f.valor }}
              title={`${f.rotulo}: ${formatNumber(f.valor)}`}
              aria-label={`${titulo}, ${f.rotulo}: ${formatNumber(f.valor)}. Abrir a lista.`}
              onClick={() => onAbrir(f.destino)}
              data-testid={`${testId}-${f.cor}`}
            />
          ))}
      </div>
    </div>
  );
};

export const FaixasLegenda: React.FC<{ faixas: Array<Pick<FaixaDaBarra, 'rotulo' | 'cor'> & { valor?: number }> }> = ({ faixas }) => (
  <div className="pn-legenda">
    {faixas.map((f) => (
      <span key={f.rotulo}>
        <i className={f.cor} aria-hidden="true" />
        {f.rotulo}
        {f.valor != null && <strong> {formatNumber(f.valor)}</strong>}
      </span>
    ))}
  </div>
);

function faixasDePrazo(f: FaixasDePrazo, rota: string, sufixo: string): FaixaDaBarra[] {
  return [
    { rotulo: 'Regular', valor: f.regular, cor: 'pn-cor-ok', destino: `${rota}?situacao=VIGENTES${sufixo}` },
    { rotulo: 'Atenção', valor: f.atencao, cor: 'pn-cor-atencao', destino: `${rota}?situacao=ATENCAO${sufixo}` },
    { rotulo: 'Crítico', valor: f.critico, cor: 'pn-cor-critico', destino: `${rota}?situacao=CRITICO${sufixo}` }
  ];
}

export interface ConsumoDasAtas {
  totalItens: number;
  /** Acima do limite crítico (SALDO_RULES.criticoAcimaDePct), esgotados inclusive. */
  criticos: number;
  /** Entre o limite de atenção e o crítico. */
  emAtencao: number;
}

/**
 * Gaveta Situação: prazo de vigência das atas e dos contratos vigentes (as faixas do trilho das carteiras) e o consumo
 * dos itens das atas (as faixas de saldo do cartão de Atas). Cada trecho abre a carteira com o filtro dele.
 */
export const GavetaSituacao: React.FC<{
  atas: FaixasDePrazo | null;
  /** Ausente para o gestor de saldos, que não vê contratos. */
  contratos?: FaixasDePrazo | null;
  consumo: ConsumoDasAtas;
  /** Filtro de gestor levado às carteiras (nome), quando o coordenador escolheu um. */
  gestorNome?: string;
  isLoading: boolean;
  onAbrir: (destino: string) => void;
}> = ({ atas, contratos, consumo, gestorNome, isLoading, onAbrir }) => {
  const sufixo = gestorNome ? `&gestor=${encodeURIComponent(gestorNome)}` : '';
  const ate = Math.max(0, consumo.totalItens - consumo.criticos - consumo.emAtencao);
  // A carteira de Itens não filtra por consumo: abre ordenada do mais consumido para o menos.
  const itens = '/itens?ordem=consumo:desc';
  const faixasConsumo: FaixaDaBarra[] = [
    { rotulo: `Até ${SALDO_RULES.atencaoAcimaDePct}%`, valor: ate, cor: 'pn-cor-neutro', destino: itens },
    { rotulo: `${SALDO_RULES.atencaoAcimaDePct}% a ${SALDO_RULES.criticoAcimaDePct}%`, valor: consumo.emAtencao, cor: 'pn-cor-atencao', destino: itens },
    { rotulo: `Acima de ${SALDO_RULES.criticoAcimaDePct}%`, valor: consumo.criticos, cor: 'pn-cor-critico', destino: itens }
  ];
  const legendaPrazo = [
    { rotulo: 'Regular', cor: 'pn-cor-ok' },
    { rotulo: `Atenção (${VIGENCIA_RULES.faixaCriticoAteDias + 1} a ${VIGENCIA_RULES.faixaAtencaoAteDias} dias)`, cor: 'pn-cor-atencao' },
    { rotulo: `Crítico (até ${VIGENCIA_RULES.faixaCriticoAteDias} dias)`, cor: 'pn-cor-critico' }
  ];

  return (
    <div className="pn-situacao">
      <div className="pn-situacao-bloco">
        <h3>
          Prazo de vigência <span>vigentes hoje</span>
        </h3>
        {isLoading || !atas ? (
          <SkeletonLoader variant="text" count={2} />
        ) : (
          <>
            <FaixasBarra titulo="Atas" faixas={faixasDePrazo(atas, '/atas', sufixo)} onAbrir={onAbrir} testId="painel-situacao-atas" />
            {contratos !== undefined && contratos && (
              <FaixasBarra titulo="Contratos" faixas={faixasDePrazo(contratos, '/contratos', sufixo)} onAbrir={onAbrir} testId="painel-situacao-contratos" />
            )}
            <FaixasLegenda faixas={legendaPrazo} />
          </>
        )}
      </div>
      <div className="pn-situacao-bloco">
        <h3>
          Consumo das atas <span>cota SENASP por item</span>
        </h3>
        <FaixasBarra titulo="Itens" faixas={faixasConsumo} onAbrir={onAbrir} testId="painel-situacao-consumo" />
        <FaixasLegenda faixas={faixasConsumo} />
      </div>
    </div>
  );
};
