import React from 'react';
import { CarteiraPrazoPill } from '../../carteira/CarteiraPrazoPill';
import { CarteiraFilterBar, carteiraCounter } from '../../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../../carteira/CarteiraFilterButton';
import { CarteiraNoResults } from '../../carteira/CarteiraNoResults';
import { CarteiraPagination } from '../../carteira/CarteiraPagination';
import { CarteiraSortHeader } from '../../carteira/CarteiraSortHeader';
import { CarteiraIdLink, abrirAoClicarNaLinha } from '../../carteira/CarteiraRowLink';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { carteiraFornecedor, carteiraTableShell, carteiraTd, carteiraTh } from '../../carteira/carteiraStyles';
import { hasActiveCarteiraFilters, useCarteiraFilters, type CarteiraFilterSchema } from '../../carteira/carteiraFilters';
import { useCarteiraPagination } from '../../carteira/useCarteiraPagination';
import { useCarteiraSort, type CarteiraSortColumn } from '../../carteira/useCarteiraSort';
import { formatDateBR } from '../../../utils/format';
import { buildAtaPath } from '../../../hooks/useAta';
import { useNavigateWithOrigin } from '../../../hooks/useDetailOrigin';
import { PESO_COMPLEXIDADE, ROTULO_COMPLEXIDADE } from './complexidade';
import type { AtaSemGestor } from './contratosSemAta';
import { contemBusca, PAGE_SIZE, TODAS, vigenciaOptions } from './filaComum';
import { SELECIONADA_BG, SelecaoBar, SelecaoCell, SelecaoHeaderCell, useSelecaoFila } from './DistribuicaoSelecao';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const listar = (numeros: string[]) => (numeros.length <= 8 ? numeros.join(', ') : `${numeros.slice(0, 8).join(', ')} e mais ${numeros.length - 8}`);

interface FiltrosAtas {
  busca: string;
  vigencia: string;
  complexidade: string;
  contratos: string;
}

const SCHEMA: CarteiraFilterSchema<FiltrosAtas> = {
  busca: { param: 'busca', default: '' },
  vigencia: { param: 'vigencia', default: TODAS, values: [TODAS, 'CRITICO', 'ATENCAO', 'REGULAR', 'EXPIRADO', 'SEM_DATA'] },
  complexidade: { param: 'complexidade', default: TODAS, values: [TODAS, 'ALTA', 'MEDIA', 'BAIXA'] },
  contratos: { param: 'contratos', default: TODAS, values: [TODAS, 'VINCULADOS', 'PROVAVEIS', 'NENHUM'] }
};

const COLUNAS: Record<string, CarteiraSortColumn<AtaSemGestor>> = {
  ata: { value: (a) => a.numeroAta },
  vigencia: { value: (a) => a.dias },
  complexidade: { value: (a) => PESO_COMPLEXIDADE[a.complexidade.nivel], firstDir: 'desc' },
  contratos: { value: (a) => a.vinculados.length + a.provaveis.length, firstDir: 'desc' }
};

const chave = (a: AtaSemGestor) => `${a.numeroAta}-${a.uasg}`;

function filtroContratos(a: AtaSemGestor, filtro: string): boolean {
  if (filtro === 'VINCULADOS') return a.vinculados.length > 0;
  if (filtro === 'PROVAVEIS') return a.provaveis.length > 0;
  if (filtro === 'NENHUM') return a.vinculados.length === 0 && a.provaveis.length === 0;
  return true;
}

interface AtasSemGestorFilaProps {
  atas: AtaSemGestor[];
  /** Só o coordenador atribui; o leitor só consulta. */
  podeAtribuir: boolean;
  /** Abre o "Para quem atribuo?" para as atas (os contratos vinculados vão junto). */
  onAtribuir: (atas: AtaSemGestor[], done?: () => void) => void;
  /** Fila do histórico: atas encerradas sem contrato vigente (muda só os textos). */
  historico?: boolean;
}

/**
 * Atas sem gestor: o trabalho principal do coordenador. Atribuir a ata leva junto os contratos já vinculados; os
 * prováveis (mesma compra e fornecedor) serão vinculados pelo servidor e herdam o gestor no vínculo.
 */
export const AtasSemGestorFila: React.FC<AtasSemGestorFilaProps> = ({ atas, podeAtribuir, onAtribuir, historico = false }) => {
  const navigate = useNavigateWithOrigin();
  const { filters, setFilter, resetFilters } = useCarteiraFilters(SCHEMA);
  const hasActive = hasActiveCarteiraFilters(SCHEMA, filters);

  const filtradas = React.useMemo(
    () =>
      atas.filter(
        (a) =>
          (filters.vigencia === TODAS || a.faixa === filters.vigencia) &&
          (filters.complexidade === TODAS || a.complexidade.nivel === filters.complexidade) &&
          filtroContratos(a, filters.contratos) &&
          contemBusca(filters.busca, a.numeroAta, a.fornecedorNome, a.objeto, ...a.vinculados, ...a.provaveis)
      ),
    [atas, filters]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(filtradas, COLUNAS);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, chave, PAGE_SIZE);

  const chavesFiltradas = React.useMemo(() => filtradas.map(chave), [filtradas]);
  const selecao = useSelecaoFila(React.useMemo(() => atas.map(chave), [atas]));
  const selecionadas = atas.filter((a) => selecao.selecionadas.has(chave(a)));
  const vinculadosSelecionados = selecionadas.reduce((n, a) => n + a.vinculados.length, 0);

  const sort = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };

  return (
    <section data-testid={historico ? 'distribuicao-atas-historico' : 'distribuicao-atas-sem-gestor'} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
        {historico ? (
          <>
            Atas encerradas, sem gestor e sem contrato vigente. Não há o que acompanhar; atribuir aqui só registra quem responde pelo
            histórico, e não pesa na carga do gestor.
          </>
        ) : (
          <>
            Ao atribuir a ata, o servidor recebe também os contratos vinculados a ela. Os prováveis (mesma compra e mesmo fornecedor) ele
            vincula na Ata 360, e passam a ser dele no momento do vínculo.
          </>
        )}
      </p>

      <CarteiraFilterBar
        busca={filters.busca}
        searchPlaceholder="Buscar por ata, fornecedor, objeto, contrato..."
        onChangeBusca={(v) => setFilter('busca', v)}
        hasActiveFilters={hasActive}
        onResetFilters={resetFilters}
        counter={carteiraCounter(filtradas.length, atas.length, hasActive, 'ata', 'atas')}
        testIdPrefix="atas-sem-gestor"
      >
        <CarteiraFilterButton
          label="Vigência"
          value={filters.vigencia}
          emptyValue={TODAS}
          options={vigenciaOptions(atas.map((a) => a.faixa))}
          onChange={(v) => setFilter('vigencia', v)}
          testId="atas-sem-gestor-filter-vigencia"
        />
        <CarteiraFilterButton
          label="Complexidade"
          value={filters.complexidade}
          emptyValue={TODAS}
          options={(['ALTA', 'MEDIA', 'BAIXA'] as const).map((n) => ({
            value: n,
            label: ROTULO_COMPLEXIDADE[n],
            count: atas.filter((a) => a.complexidade.nivel === n).length
          }))}
          onChange={(v) => setFilter('complexidade', v)}
          testId="atas-sem-gestor-filter-complexidade"
        />
        <CarteiraFilterButton
          label="Contratos"
          value={filters.contratos}
          emptyValue={TODAS}
          options={[
            { value: 'VINCULADOS', label: 'Com contratos vinculados', count: atas.filter((a) => a.vinculados.length > 0).length },
            { value: 'PROVAVEIS', label: 'Com prováveis a vincular', count: atas.filter((a) => a.provaveis.length > 0).length },
            { value: 'NENHUM', label: 'Sem contratos', count: atas.filter((a) => filtroContratos(a, 'NENHUM')).length }
          ]}
          onChange={(v) => setFilter('contratos', v)}
          testId="atas-sem-gestor-filter-contratos"
        />
      </CarteiraFilterBar>

      {podeAtribuir && selecionadas.length > 0 && (
        <SelecaoBar
          quantidade={selecionadas.length}
          singular="ata"
          plural="atas"
          detalhe={vinculadosSelecionados > 0 ? `levam ${plural(vinculadosSelecionados, 'contrato vinculado', 'contratos vinculados')}` : undefined}
          totalFiltrado={filtradas.length}
          onSelecionarTodas={() => selecao.selecionarTodas(chavesFiltradas)}
          onLimpar={selecao.limpar}
          onAtribuir={() => onAtribuir(selecionadas, selecao.limpar)}
          testIdPrefix="atas-sem-gestor"
        />
      )}

      {atas.length === 0 ? (
        <div style={{ ...carteiraTableShell, padding: '1.25rem', fontSize: '0.85rem', color: '#64748b' }}>
          {historico ? 'Todas as atas encerradas já têm gestor.' : 'Todas as atas com algo a distribuir já têm gestor.'}
        </div>
      ) : filtradas.length === 0 ? (
        <CarteiraNoResults title="Nenhuma ata encontrada" description="Nenhuma ata sem gestor atende aos filtros." onResetFilters={resetFilters} />
      ) : (
        <div style={carteiraTableShell}>
          <div style={{ overflowX: 'auto' }}>
            <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {podeAtribuir && (
                    <SelecaoHeaderCell
                      chavesDaPagina={pageItems.map(chave)}
                      selecionadas={selecao.selecionadas}
                      onToggle={() => selecao.alternarVarias(pageItems.map(chave))}
                      testId="atas-sem-gestor-selecionar-pagina"
                    />
                  )}
                  <CarteiraSortHeader label="Ata" sortKey="ata" {...sort} />
                  <CarteiraSortHeader label="Vigência" sortKey="vigencia" {...sort} />
                  <CarteiraSortHeader label="Complexidade" sortKey="complexidade" {...sort} />
                  <CarteiraSortHeader label="Contratos" sortKey="contratos" {...sort} />
                  {podeAtribuir && <th style={{ ...carteiraTh, textAlign: 'right' }}>Ação</th>}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((ata) => {
                  const k = chave(ata);
                  const marcada = selecao.selecionadas.has(k);
                  return (
                    <tr
                      key={k}
                      data-testid={`ata-sem-gestor-${ata.numeroAta}`}
                      className="carteira-row-link"
                      onClick={abrirAoClicarNaLinha(() => navigate(buildAtaPath(ata.numeroAta, ata.uasg)))}
                      style={marcada ? { background: SELECIONADA_BG } : undefined}
                    >
                      {podeAtribuir && (
                        <SelecaoCell checked={marcada} onToggle={() => selecao.alternar(k)} label={`Selecionar ata ${ata.numeroAta}`} testId={`ata-sem-gestor-check-${ata.numeroAta}`} />
                      )}
                      <td style={{ ...carteiraTd, minWidth: '220px', maxWidth: '340px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.15rem' }}>
                          <CarteiraIdLink
                            onClick={() => navigate(buildAtaPath(ata.numeroAta, ata.uasg))}
                            label={`Ver detalhes da ata ${ata.numeroAta}`}
                            title={`Ver detalhes · UASG ${ata.uasg}`}
                          >
                            {ata.numeroAta}
                          </CarteiraIdLink>
                          {ata.fornecedorNome && (
                            <div title={ata.fornecedorNome} style={carteiraFornecedor}>
                              {ata.fornecedorNome}
                            </div>
                          )}
                        </div>
                      </td>
                      <td data-label="Vigência" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                        <CarteiraPrazoPill faixa={ata.faixa} diasRestantes={ata.dias} />
                        {ata.vigenciaFim && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>até {formatDateBR(ata.vigenciaFim)}</div>
                        )}
                      </td>
                      <td data-label="Complexidade" style={carteiraTd}>
                        <div title={`Complexidade ${ROTULO_COMPLEXIDADE[ata.complexidade.nivel]}: ${ata.complexidade.motivo}`}>
                          <div style={{ fontWeight: 800 }}>{ROTULO_COMPLEXIDADE[ata.complexidade.nivel]}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{ata.complexidade.motivo}</div>
                        </div>
                      </td>
                      <td data-label="Contratos" style={{ ...carteiraTd, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                          <span
                            title={ata.vinculados.length ? `Vinculados: ${listar(ata.vinculados)}` : undefined}
                            style={{ fontWeight: 700, color: ata.vinculados.length ? '#0f172a' : '#94a3b8' }}
                          >
                            {ata.vinculados.length ? `${plural(ata.vinculados.length, 'vinculado', 'vinculados')} (vão junto)` : 'Nenhum vinculado'}
                          </span>
                          {ata.provaveis.length > 0 && (
                            <span title={`Prováveis: ${listar(ata.provaveis)}`} style={{ color: 'var(--color-warning-text)', fontWeight: 700 }}>
                              {plural(ata.provaveis.length, 'provável', 'prováveis')} a vincular
                            </span>
                          )}
                        </div>
                      </td>
                      {podeAtribuir && (
                        <td data-role="action" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <ActionButton action="atribuir"
                            type="button"
                            size="sm"
                            onClick={() => onAtribuir([ata])}
                            data-testid={`ata-sem-gestor-atribuir-${ata.numeroAta}`}
                           />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <CarteiraPagination page={currentPage} pageSize={PAGE_SIZE} total={sorted.length} onChange={setPage} testIdPrefix="atas-sem-gestor" />
        </div>
      )}
    </section>
  );
};
