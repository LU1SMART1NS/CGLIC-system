import React from 'react';
import { AppButton } from '../../design-system/components/AppButton';

/**
 * Caixa de colunas da janela Exportar (Carteira › Itens, Emendas › Itens): título com quantas linhas saem, "x de N
 * colunas" com Todas · Nenhuma, e uma caixa de marcar por coluna. A ordem do arquivo é a da lista, não a do clique.
 */
export const ColunasParaExportar: React.FC<{
  testId: string;
  titulo: string;
  /** Ao lado do título (ex.: "· 2 linhas"). */
  detalhe?: string;
  colunas: ReadonlyArray<{ id: string; titulo: string }>;
  marcadas: readonly string[];
  onChange: (ids: string[]) => void;
  /** Texto quando nada está marcado (ex.: "Sem colunas, esta aba não entra no arquivo."). */
  semColunas?: string;
}> = ({ testId, titulo, detalhe, colunas, marcadas, onChange, semColunas }) => {
  const quantas = colunas.filter((c) => marcadas.includes(c.id)).length;
  return (
    <fieldset style={{ border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 8, padding: '0.75rem 0.9rem', margin: 0 }} data-testid={testId}>
      <legend style={{ fontWeight: 700, fontSize: '0.9rem', padding: '0 0.3rem' }}>
        {titulo}
        {detalhe && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · {detalhe}</span>}
      </legend>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <span>
          {quantas} de {colunas.length} colunas
        </span>
        <AppButton type="button" size="xs" variant="link" onClick={() => onChange(colunas.map((c) => c.id))} data-testid={`${testId}-todas`}>
          Todas
        </AppButton>
        <AppButton type="button" size="xs" variant="link" onClick={() => onChange([])} data-testid={`${testId}-nenhuma`}>
          Nenhuma
        </AppButton>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: '0.35rem 1rem' }}>
        {colunas.map((c) => (
          <label key={c.id} style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', fontSize: '0.85rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={marcadas.includes(c.id)}
              onChange={(e) => onChange(e.target.checked ? colunas.map((x) => x.id).filter((id) => id === c.id || marcadas.includes(id)) : marcadas.filter((id) => id !== c.id))}
              data-testid={`${testId}-${c.id}`}
            />
            {c.titulo}
          </label>
        ))}
      </div>
      {quantas === 0 && semColunas && <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{semColunas}</div>}
    </fieldset>
  );
};
