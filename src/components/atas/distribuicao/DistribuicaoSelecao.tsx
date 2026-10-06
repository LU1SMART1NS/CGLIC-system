import React from 'react';
import { CheckSquare, UserPlus, X } from 'lucide-react';
import { AppButton } from '../../../design-system/components/AppButton';
import { carteiraTd, carteiraTh } from '../../carteira/carteiraStyles';

/**
 * Seleção em lote das filas (padrão Gmail / "alterar em lote" do Jira): a seleção sobrevive à troca de página e
 * some o que deixou de estar na fila (ex.: atribuído por outra pessoa e recarregado).
 */
export function useSelecaoFila(chavesDaFila: string[]) {
  const [selecionadas, setSelecionadas] = React.useState<Set<string>>(() => new Set());
  const naFila = React.useMemo(() => new Set(chavesDaFila), [chavesDaFila]);

  React.useEffect(() => {
    setSelecionadas((prev) => {
      const next = new Set([...prev].filter((k) => naFila.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [naFila]);

  const alternar = React.useCallback((chave: string) => {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  }, []);

  /** Marca as chaves (todas já marcadas → desmarca). */
  const alternarVarias = React.useCallback((chaves: string[]) => {
    setSelecionadas((prev) => {
      const todas = chaves.length > 0 && chaves.every((k) => prev.has(k));
      const next = new Set(prev);
      for (const k of chaves) {
        if (todas) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }, []);

  const selecionarTodas = React.useCallback((chaves: string[]) => setSelecionadas(new Set(chaves)), []);
  const limpar = React.useCallback(() => setSelecionadas(new Set()), []);

  return { selecionadas, alternar, alternarVarias, selecionarTodas, limpar };
}

const checkboxStyle: React.CSSProperties = { width: '15px', height: '15px', cursor: 'pointer', accentColor: 'var(--primary)' };

/** Cabeçalho com "marcar a página". */
export const SelecaoHeaderCell: React.FC<{ chavesDaPagina: string[]; selecionadas: Set<string>; onToggle: () => void; testId: string }> = ({
  chavesDaPagina,
  selecionadas,
  onToggle,
  testId
}) => {
  const marcadas = chavesDaPagina.filter((k) => selecionadas.has(k)).length;
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = marcadas > 0 && marcadas < chavesDaPagina.length;
  }, [marcadas, chavesDaPagina.length]);
  return (
    <th style={{ ...carteiraTh, width: '36px', padding: '0.65rem 0.4rem 0.65rem 0.85rem' }}>
      <input
        ref={ref}
        type="checkbox"
        checked={chavesDaPagina.length > 0 && marcadas === chavesDaPagina.length}
        onChange={onToggle}
        aria-label="Selecionar todos desta página"
        data-testid={testId}
        style={checkboxStyle}
      />
    </th>
  );
};

export const SelecaoCell: React.FC<{ checked: boolean; onToggle: () => void; label: string; testId: string; disabled?: boolean }> = ({
  checked,
  onToggle,
  label,
  testId,
  disabled = false
}) => (
  <td data-role="select" style={{ ...carteiraTd, width: '36px', padding: '0.7rem 0.4rem 0.7rem 0.85rem' }}>
    <input
      type="checkbox"
      checked={checked}
      onChange={onToggle}
      disabled={disabled}
      aria-label={label}
      data-testid={testId}
      style={{ ...checkboxStyle, cursor: disabled ? 'not-allowed' : checkboxStyle.cursor, opacity: disabled ? 0.4 : 1 }}
    />
  </td>
);

/** Fundo da linha marcada. */
export const SELECIONADA_BG = 'var(--color-info-bg)';

interface SelecaoBarProps {
  quantidade: number;
  /** "ata"/"atas", "contrato"/"contratos". */
  singular: string;
  plural: string;
  /** Detalhe depois da contagem (ex.: "levam 5 contratos vinculados"). */
  detalhe?: string;
  /** Total da fila filtrada: oferece "Selecionar todas as N" quando a seleção é menor. */
  totalFiltrado: number;
  onSelecionarTodas: () => void;
  onLimpar: () => void;
  onAtribuir: () => void;
  testIdPrefix: string;
}

/** Barra de ações em lote: aparece com algo marcado, acima da tabela. */
export const SelecaoBar: React.FC<SelecaoBarProps> = ({
  quantidade,
  singular,
  plural,
  detalhe,
  totalFiltrado,
  onSelecionarTodas,
  onLimpar,
  onAtribuir,
  testIdPrefix
}) => (
  <div
    role="region"
    aria-label="Ações em lote"
    data-testid={`${testIdPrefix}-selecao`}
    style={{
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '0.6rem',
      padding: '0.55rem 0.85rem',
      background: SELECIONADA_BG,
      border: '1px solid var(--color-info-border)',
      borderRadius: '8px',
      fontSize: '0.8rem',
      color: 'var(--color-info-text-strong)'
    }}
  >
    <CheckSquare size={15} aria-hidden="true" />
    <strong>
      {quantidade} {quantidade === 1 ? `${singular} selecionada` : `${plural} selecionadas`}
    </strong>
    {detalhe && <span>· {detalhe}</span>}
    {quantidade < totalFiltrado && (
      <AppButton type="button" variant="link" size="sm" onClick={onSelecionarTodas} data-testid={`${testIdPrefix}-selecionar-todas`}>
        Selecionar todas as {totalFiltrado}
      </AppButton>
    )}
    <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.4rem' }}>
      <AppButton type="button" variant="outline" size="sm" onClick={onLimpar} data-testid={`${testIdPrefix}-limpar-selecao`} icon={<X size={14} />}>
        Limpar
      </AppButton>
      <AppButton
        type="button"
        variant="primary"
        size="sm"
        onClick={onAtribuir}
        data-testid={`${testIdPrefix}-atribuir-selecionadas`}
        icon={<UserPlus size={14} />}
      >
        Atribuir a...
      </AppButton>
    </span>
  </div>
);
