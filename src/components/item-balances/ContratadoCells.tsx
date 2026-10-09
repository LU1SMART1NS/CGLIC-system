import React from 'react';
import { AppButton, StatusBadge } from '../../design-system';
import { legendaDaQuantidade } from '../../utils/contratadoPorUnidade';
import type { QuantidadeDoContrato } from '../../services/contratadoUnidadeService';
import { formatNumber } from './itemBalanceUtils';

const sub: React.CSSProperties = { display: 'block', fontFamily: 'var(--font-family)', fontWeight: 500, fontSize: '0.75rem', color: 'var(--text-muted)' };

/**
 * Coluna "Qtd. contratada" do contrato no item: a quantidade usada no saldo; com ajuste, a tag Ajustada e embaixo o
 * número do site de onde veio ("No Contratos.gov.br: 480"); sem ajuste, só "do Contratos.gov.br". Se a fonte mudou
 * depois do ajuste, o aviso em vermelho. O link Ajustar abre a janela (gestor e coordenador).
 */
export const QuantidadeContratadaCelula: React.FC<{ q: QuantidadeDoContrato; onAjustar?: () => void }> = ({ q, onAjustar }) => {
  const legenda = legendaDaQuantidade(q);
  return (
    <div data-testid={`qtd-contratada-${q.contractKey}`}>
      {q.quantidadeContratada != null ? (
        <span style={{ fontWeight: 700, color: 'var(--success)' }}>{formatNumber(q.quantidadeContratada)}</span>
      ) : (
        <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>N/D</span>
      )}{' '}
      {q.ajustada && (
        <span style={{ fontFamily: 'var(--font-family)' }}>
          <StatusBadge label="Ajustada" variant="warning" size="sm" dot={false} testId={`qtd-ajustada-${q.contractKey}`} />
        </span>
      )}
      <span style={sub}>{legenda.linha}</span>
      {legenda.aviso && <span style={{ ...sub, color: 'var(--danger)' }}>{legenda.aviso}</span>}
      {onAjustar && (
        <AppButton variant="link" size="sm" onClick={onAjustar} data-testid={`qtd-ajustar-${q.contractKey}`} style={{ padding: 0, minHeight: 0, fontSize: '0.75rem' }}>
          Ajustar
        </AppButton>
      )}
    </div>
  );
};

/** Coluna "Unidades internas" do contrato no item: as partes de cada unidade, a origem e o que falta. */
export const UnidadesDoContratoCelula: React.FC<{ q: QuantidadeDoContrato; onAbrir?: () => void }> = ({ q, onAbrir }) => {
  const partes = q.unidades.filter((u) => u.quantidade > 0);
  return (
    <div data-testid={`unidades-contrato-${q.contractKey}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
      {partes.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
          {partes.map((u) => (
            <StatusBadge key={u.unidade} label={`${u.unidade} ${formatNumber(u.quantidade)}`} variant={u.alocada ? 'neutral' : 'danger'} size="sm" dot={false} />
          ))}
          {q.divisaoOrigem === 'AUTO' && <StatusBadge label="AUTO" variant="info" size="sm" dot={false} />}
        </div>
      )}
      {q.situacao === 'SEM_QUANTIDADE' ? (
        <span style={sub}>sem quantidade</span>
      ) : q.situacao === 'CONFERIR' ? (
        <StatusBadge label="Conferir" variant="danger" size="sm" dot={false} />
      ) : q.quantidadeSemUnidade > 0 ? (
        <StatusBadge label={`Sem unidade · ${formatNumber(q.quantidadeSemUnidade)}`} variant="warning" size="sm" dot={false} />
      ) : null}
      {onAbrir && q.situacao !== 'SEM_QUANTIDADE' && (
        <AppButton variant={q.quantidadeSemUnidade > 0 && partes.length === 0 ? 'primary' : 'outline'} size="sm" onClick={onAbrir} data-testid={`unidades-abrir-${q.contractKey}`}>
          Unidades
        </AppButton>
      )}
    </div>
  );
};
