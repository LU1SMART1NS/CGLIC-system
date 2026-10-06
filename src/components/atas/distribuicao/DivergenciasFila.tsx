import React from 'react';
import { CarteiraFilterBar, carteiraCounter } from '../../carteira/CarteiraFilterBar';
import { CarteiraNoResults } from '../../carteira/CarteiraNoResults';
import { CarteiraPagination } from '../../carteira/CarteiraPagination';
import { CarteiraSortHeader } from '../../carteira/CarteiraSortHeader';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { carteiraTableShell, carteiraTd, carteiraTh } from '../../carteira/carteiraStyles';
import { hasActiveCarteiraFilters, useCarteiraFilters, type CarteiraFilterSchema } from '../../carteira/carteiraFilters';
import { useCarteiraPagination } from '../../carteira/useCarteiraPagination';
import { useCarteiraSort, type CarteiraSortColumn } from '../../carteira/useCarteiraSort';
import type { DistribuicaoDivergencia } from './distribuicaoEquipe';
import { contemBusca, PAGE_SIZE } from './filaComum';

const SCHEMA: CarteiraFilterSchema<{ busca: string }> = { busca: { param: 'busca', default: '' } };

const COLUNAS: Record<string, CarteiraSortColumn<DistribuicaoDivergencia>> = {
  ata: { value: (d) => d.numeroAta },
  gestorAta: { value: (d) => d.gestorAta },
  contrato: { value: (d) => d.numeroContrato },
  gestorContrato: { value: (d) => d.gestorContrato }
};

const chave = (d: DistribuicaoDivergencia) => `${d.numeroAta}|${d.contractKey}`;
const semGestor = <em style={{ color: 'var(--color-warning-text)' }}>Sem gestor</em>;

interface DivergenciasFilaProps {
  divergencias: DistribuicaoDivergencia[];
  podeAlinhar: boolean;
  /** Atribui o gestor à ata, o que o leva a todos os contratos vinculados. */
  onAlinhar: (d: DistribuicaoDivergencia) => void;
}

/** Contratos vinculados a uma ata com gestor diferente do da ata (fora da regra). */
export const DivergenciasFila: React.FC<DivergenciasFilaProps> = ({ divergencias, podeAlinhar, onAlinhar }) => {
  const { filters, setFilter, resetFilters } = useCarteiraFilters(SCHEMA);
  const hasActive = hasActiveCarteiraFilters(SCHEMA, filters);
  const filtradas = React.useMemo(
    () => divergencias.filter((d) => contemBusca(filters.busca, d.numeroAta, d.numeroContrato, d.gestorAta, d.gestorContrato)),
    [divergencias, filters.busca]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(filtradas, COLUNAS);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, chave, PAGE_SIZE);
  const sort = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };

  return (
    <section data-testid="distribuicao-divergencias" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
        Pela regra, o contrato vinculado a uma ata tem o mesmo gestor da ata. "Alinhar gestor" atribui o gestor à ata e o leva a todos os
        contratos vinculados a ela.
      </p>

      <CarteiraFilterBar
        busca={filters.busca}
        searchPlaceholder="Buscar por ata, contrato, gestor..."
        onChangeBusca={(v) => setFilter('busca', v)}
        hasActiveFilters={hasActive}
        onResetFilters={resetFilters}
        counter={carteiraCounter(filtradas.length, divergencias.length, hasActive, 'contrato', 'contratos')}
        testIdPrefix="divergencias"
      />

      {divergencias.length === 0 ? (
        <div style={{ ...carteiraTableShell, padding: '1.25rem', fontSize: '0.85rem', color: '#64748b' }}>
          Todos os contratos vinculados seguem o gestor da ata.
        </div>
      ) : filtradas.length === 0 ? (
        <CarteiraNoResults title="Nenhum contrato encontrado" description="Nenhuma divergência atende à busca." onResetFilters={resetFilters} />
      ) : (
        <div style={carteiraTableShell}>
          <div style={{ overflowX: 'auto' }}>
            <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <CarteiraSortHeader label="Ata" sortKey="ata" {...sort} />
                  <CarteiraSortHeader label="Gestor da ata" sortKey="gestorAta" {...sort} />
                  <CarteiraSortHeader label="Contrato" sortKey="contrato" {...sort} />
                  <CarteiraSortHeader label="Gestor do contrato" sortKey="gestorContrato" {...sort} />
                  {podeAlinhar && <th style={{ ...carteiraTh, textAlign: 'right' }}>Ação</th>}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((d) => (
                  <tr key={chave(d)} data-testid={`distribuicao-divergencia-${d.contractKey}`}>
                    <td data-label="Ata" style={{ ...carteiraTd, fontWeight: 800, whiteSpace: 'nowrap' }}><span>{d.numeroAta}</span></td>
                    <td data-label="Gestor da ata" style={carteiraTd}><span>{d.gestorAta || semGestor}</span></td>
                    <td data-label="Contrato" style={{ ...carteiraTd, fontWeight: 800, whiteSpace: 'nowrap' }}><span>{d.numeroContrato}</span></td>
                    <td data-label="Gestor do contrato" style={carteiraTd}><span>{d.gestorContrato || semGestor}</span></td>
                    {podeAlinhar && (
                      <td data-role="action" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <ActionButton action="alinharGestor"
                          type="button"
                          size="sm"
                          onClick={() => onAlinhar(d)}
                          data-testid={`distribuicao-alinhar-${d.contractKey}`}
                         />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CarteiraPagination page={currentPage} pageSize={PAGE_SIZE} total={sorted.length} onChange={setPage} testIdPrefix="divergencias" />
        </div>
      )}
    </section>
  );
};
