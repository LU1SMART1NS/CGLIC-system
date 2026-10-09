import React from 'react';
import { StatusBadge } from '../../design-system';
import { quantidadeQuebrada } from '../../utils/distribuicaoEmpenho';
import { formatNumber } from './itemBalanceUtils';

interface CampoQuantidadeNotaProps {
  /** Quantidade usada hoje (informada ou calculada); nula = a definir. */
  quantidade: number | null;
  /** Valor ÷ preço unitário; nula sem valor ou sem preço. */
  calculada: number | null;
  /** A quantidade foi digitada por alguém (marcador "Informada"). */
  informada: boolean;
  /** Dá para voltar à calculada (a parcela tem valor em R$). */
  podeVoltarACalculada: boolean;
  disabled: boolean;
  ariaLabel: string;
  testId: string;
  /** Grava a nova quantidade; nula = volta à calculada. */
  onGravar: (quantidade: number | null) => void;
}

const mostrar = (q: number | null) => (q == null ? '' : quantidadeQuebrada(q) ? formatNumber(q) : String(Math.round(q)));

/**
 * Campo da quantidade de uma nota em um item (migration 104): só números inteiros; grava ao sair do campo ou com
 * Enter; Esc desfaz a digitação. Digitar de novo a quantidade calculada volta à calculada.
 */
export const CampoQuantidadeNota: React.FC<CampoQuantidadeNotaProps> = ({
  quantidade,
  calculada,
  informada,
  podeVoltarACalculada,
  disabled,
  ariaLabel,
  testId,
  onGravar
}) => {
  const [texto, setTexto] = React.useState(mostrar(quantidade));
  const [erro, setErro] = React.useState<string | null>(null);
  React.useEffect(() => setTexto(mostrar(quantidade)), [quantidade]);

  const gravar = () => {
    const t = texto.trim();
    if (t === mostrar(quantidade)) return setErro(null);
    if (!/^\d+$/.test(t) || Number(t) <= 0) {
      setTexto(mostrar(quantidade));
      return setErro('Informe um número inteiro maior que zero.');
    }
    setErro(null);
    const q = Number(t);
    const igualACalculada = calculada != null && Math.abs(calculada - q) < 1e-6;
    onGravar(igualACalculada && podeVoltarACalculada ? null : q);
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        {informada && <StatusBadge label="Informada" variant="info" size="sm" dot={false} testId={`${testId}-informada`} />}
        <input
          className="form-input"
          inputMode="numeric"
          value={texto}
          placeholder="0"
          disabled={disabled}
          aria-label={ariaLabel}
          data-testid={testId}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={gravar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setTexto(mostrar(quantidade));
          }}
          style={{
            width: '80px',
            textAlign: 'right',
            padding: '0.25rem 0.45rem',
            fontFamily: 'monospace',
            fontWeight: 700,
            height: 'auto',
            borderColor: informada ? 'var(--primary)' : undefined,
            color: informada ? undefined : 'var(--text-secondary)'
          }}
        />
        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>un</span>
      </div>
      {erro && <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{erro}</span>}
    </div>
  );
};

/** Aviso embaixo da quantidade: a definir (sem valor e sem preço) ou calculada quebrada. */
export const AvisoQuantidade: React.FC<{ quantidade: number | null; testId?: string }> = ({ quantidade, testId }) =>
  quantidade == null || quantidadeQuebrada(quantidade) ? (
    <div style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: '0.15rem' }} data-testid={testId}>
      {quantidade == null ? 'Informe a quantidade desta nota.' : 'A quantidade calculada não é inteira. Informe a quantidade certa.'}
    </div>
  ) : null;
