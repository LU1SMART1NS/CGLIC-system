import React from 'react';
import { Package, FileText, Coins, AlertTriangle } from 'lucide-react';
import { SALDO_RULES, VIGENCIA_RULES } from '../../config/alertRules';
import { formatCurrency } from '../../utils/format';
import { PainelCartao, PainelCartoes, type PainelCartaoLinha } from './PainelCartao';

export interface GestaoInstrumentosCounts {
  // Card 1 — ARP
  totalAtas: number;
  itensCriticosArp: number;
  itensProximosLimiteArp: number;
  // Card 2 — Contratos
  contratosAtivos: number;
  contratosEmAtencao60a90d: number;
  contratosEmProrrogacao: number;
  contratosAVencer30d: number;
  // Card 3 — Valor Global
  valorVigenteTotal: number;
  totalEmpenhado: number;
  // Card 4 — Alertas
  criticalCount: number;
  totalAlertasAtivos: number;
  urgenteCount: number;
  atencaoCount: number;
}

export type GestaoInstrumentosCardId = 'ARP' | 'CONTRATOS' | 'VALOR' | 'ALERTAS';

interface GestaoInstrumentosSummaryCardsProps {
  counts: GestaoInstrumentosCounts;
  activeCard: GestaoInstrumentosCardId | null;
  onSelectCard: (card: GestaoInstrumentosCardId) => void;
  /** Gestor de Saldo: card de Atas e card de alertas contando só os avisos de saldo; contratos e valor ficam fora. */
  saldosOnly?: boolean;
}

function formatPercent(part: number, total: number): string {
  if (!total) return '0,0%';
  return `${((part / total) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Valor em vermelho/âmbar só quando há o que olhar. */
const seHouver = (n: number, tom: 'danger' | 'warning'): PainelCartaoLinha['tom'] => (n > 0 ? tom : undefined);

/** Os quatro cartões do Início (Atas, Contratos, Valor, Alertas), cada um com a peça comum PainelCartao. */
export const GestaoInstrumentosSummaryCards: React.FC<GestaoInstrumentosSummaryCardsProps> = ({
  counts,
  activeCard,
  onSelectCard,
  saldosOnly = false
}) => {
  const saldoDisponivel = counts.valorVigenteTotal - counts.totalEmpenhado;

  return (
    <PainelCartoes>
      <PainelCartao
        rotulo="Atas de Registro de Preço (ARP)"
        icone={<Package size={16} />}
        tom="primary"
        valor={counts.totalAtas}
        unidade="geridas"
        ativo={activeCard === 'ARP'}
        onClick={() => onSelectCard('ARP')}
        testId="instrumentos-card-arp"
        linhas={[
          { rotulo: `Saldo crítico (>${SALDO_RULES.criticoAcimaDePct}%)`, valor: counts.itensCriticosArp, tom: seHouver(counts.itensCriticosArp, 'danger') },
          { rotulo: `Saldo em atenção (${SALDO_RULES.atencaoAcimaDePct}–${SALDO_RULES.criticoAcimaDePct}%)`, valor: counts.itensProximosLimiteArp, tom: seHouver(counts.itensProximosLimiteArp, 'warning') }
        ]}
      />

      {!saldosOnly && (
        <>
          <PainelCartao
            rotulo="Contratos Vigentes"
            icone={<FileText size={16} />}
            tom="success"
            valor={counts.contratosAtivos}
            unidade="ativos"
            ativo={activeCard === 'CONTRATOS'}
            onClick={() => onSelectCard('CONTRATOS')}
            testId="instrumentos-card-contratos"
            linhas={[
              { rotulo: `Em atenção (${VIGENCIA_RULES.faixaCriticoAteDias + 1}–${VIGENCIA_RULES.faixaAtencaoAteDias} dias)`, valor: counts.contratosEmAtencao60a90d, tom: seHouver(counts.contratosEmAtencao60a90d, 'warning') },
              { rotulo: 'Em prorrogação', valor: counts.contratosEmProrrogacao },
              { rotulo: `A vencer (≤${VIGENCIA_RULES.faixaCriticoAteDias} dias)`, valor: counts.contratosAVencer30d, tom: seHouver(counts.contratosAVencer30d, 'danger') }
            ]}
          />

          <PainelCartao
            rotulo="Valor Total Global"
            icone={<Coins size={16} />}
            tom="amber"
            valor={<span style={{ fontSize: '1.35rem' }}>{formatCurrency(counts.valorVigenteTotal)}</span>}
            ativo={activeCard === 'VALOR'}
            onClick={() => onSelectCard('VALOR')}
            testId="instrumentos-card-valor"
            linhas={[
              { rotulo: 'Empenho realizado', valor: `${formatCurrency(counts.totalEmpenhado)} (${formatPercent(counts.totalEmpenhado, counts.valorVigenteTotal)})` },
              { rotulo: 'Saldo disponível', valor: `${formatCurrency(saldoDisponivel)} (${formatPercent(saldoDisponivel, counts.valorVigenteTotal)})` }
            ]}
          />
        </>
      )}

      {/* Para o Gestor de Saldo: só os avisos de saldo das Atas. */}
      <PainelCartao
        rotulo={saldosOnly ? 'Alertas de Saldo' : 'Alertas Críticos'}
        icone={<AlertTriangle size={16} />}
        tom="danger"
        valor={counts.criticalCount}
        unidade={saldosOnly ? 'itens esgotados' : 'itens críticos'}
        ativo={activeCard === 'ALERTAS'}
        onClick={() => onSelectCard('ALERTAS')}
        testId="instrumentos-card-alertas"
        linhas={[
          { rotulo: saldosOnly ? 'Pendências de saldo' : 'Pendências totais', valor: counts.totalAlertasAtivos },
          { rotulo: saldosOnly ? `Urgentes (acima de ${SALDO_RULES.criticoAcimaDePct}%)` : 'Urgentes', valor: counts.urgenteCount, tom: seHouver(counts.urgenteCount, 'warning') },
          { rotulo: saldosOnly ? `Em atenção (${SALDO_RULES.atencaoAcimaDePct}–${SALDO_RULES.criticoAcimaDePct}%)` : 'Em atenção', valor: counts.atencaoCount }
        ]}
      />
    </PainelCartoes>
  );
};
