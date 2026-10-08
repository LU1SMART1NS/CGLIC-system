import React, { useMemo, useState } from 'react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../design-system/components/ErrorState';
import { EmptyState } from '../../design-system/components/EmptyState';
import { ActionButton, AppButton, NoticeBar, useToast } from '../../design-system';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { useAuth } from '../../context/AuthContext';
import { useFaturasCarteira } from '../../hooks/useFinanceiroCarteira';
import { useContratosComEmpenhosConsultados } from '../../hooks/useVinculacaoEmpenhos';
import { useAcoesVinculoEmpenho } from '../../hooks/useVinculoEmpenhosContrato';
import { VincularEmpenhoModal, type PedidoDeVinculo } from '../contracts/EmpenhoVinculoModals';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraFilterBar, CarteiraGestorSelect, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraNoResults } from '../carteira/CarteiraNoResults';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { CarteiraSortHeader } from '../carteira/CarteiraSortHeader';
import { CarteiraIdLink, abrirAoClicarNaLinha } from '../carteira/CarteiraRowLink';
import { carteiraSubtitle, carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
import { hasActiveCarteiraFilters, useCarteiraFilters, type CarteiraFilterSchema } from '../carteira/carteiraFilters';
import { TODOS_GESTORES, listGestores, matchesGestorFilter } from '../carteira/carteiraGestor';
import { formatCurrency } from '../carteira/carteiraFormat';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { useContratosDoFinanceiro, uasgDaChave } from '../financeiro/useContratosDoFinanceiro';
import { dataBR, normalizarBusca } from '../financeiro/financeiroFormat';
import { VinculacaoPageHeader } from './VinculacaoPageHeader';
import { empenhosCitadosSemVinculo, type EmpenhoCitadoSemVinculo } from './vinculacaoEmpenhos';

interface Filtros {
  uasg: string;
  gestor: string;
  busca: string;
}
const TODOS = 'TODOS';
const PAGE_SIZE = 20;
const SCHEMA: CarteiraFilterSchema<Filtros> = {
  uasg: { param: 'uasg', default: TODOS },
  gestor: { param: 'gestor', default: TODOS_GESTORES },
  busca: { param: 'busca', default: '' }
};
const subtle: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b', fontWeight: 600 };
const CONTRATOS_GOV = 'https://contratos.comprasnet.gov.br';

/** A janela "Vincular empenho ao contrato" para uma linha da fila (os hooks são por contrato). */
const VincularAoContratoDialog: React.FC<{
  linha: EmpenhoCitadoSemVinculo;
  contrato: { numero: string; fornecedorNome?: string; fornecedorCnpj?: string };
  onFechar: () => void;
}> = ({ linha, contrato, onFechar }) => {
  const acoes = useAcoesVinculoEmpenho(linha.fatura.contractKey);
  const toast = useToast();
  const confirmar = (pedido: PedidoDeVinculo) =>
    acoes.vincular.mutate(pedido, {
      onSuccess: (r) => {
        toast.success(`${r.numeroOficial || 'Empenho'} vinculado ao contrato ${contrato.numero}.`);
        onFechar();
      }
    });
  return (
    <VincularEmpenhoModal
      isOpen
      contrato={{ numero: contrato.numero, uasg: uasgDaChave(linha.fatura.contractKey), fornecedorNome: contrato.fornecedorNome, fornecedorCnpjCpf: contrato.fornecedorCnpj }}
      idsVinculados={new Set()}
      numeroInicial={linha.numeroEmpenho}
      isLoading={acoes.vincular.isPending}
      erro={acoes.vincular.error?.message}
      onVincular={confirmar}
      onFechar={onFechar}
    />
  );
};

/**
 * Vinculação → Empenhos ao contrato: notas que uma fatura do Contratos.gov.br cita, mas que não estão vinculadas ao
 * contrato no sistema. Ou a nota falta no contrato (vincular à mão) ou a fatura está no contrato errado (corrigir
 * no Contratos.gov.br). Só contratos cujos empenhos já foram consultados.
 */
export const EmpenhosContratoPage: React.FC = () => {
  const navigate = useNavigateWithOrigin();
  const { role } = useAuth();
  const podeVincular = role === 'admin' || role === 'gestor';
  const faturas = useFaturasCarteira();
  const consultados = useContratosComEmpenhosConsultados();
  const { contrato, escopo, showGestorFilter, isLoading: carregandoContratos } = useContratosDoFinanceiro();
  const { filters, setFilter, resetFilters } = useCarteiraFilters(SCHEMA);
  const [vinculando, setVinculando] = useState<EmpenhoCitadoSemVinculo | null>(null);

  const todas = useMemo(() => {
    const linhas = empenhosCitadosSemVinculo(faturas.data ?? [], consultados.data ?? new Set());
    return escopo ? linhas.filter((l) => escopo.has(l.fatura.contractKey)) : linhas;
  }, [faturas.data, consultados.data, escopo]);
  const gestorDe = (l: EmpenhoCitadoSemVinculo) => contrato(l.fatura.contractKey).gestorNome;
  const uasgs = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of todas) m.set(uasgDaChave(l.fatura.contractKey), (m.get(uasgDaChave(l.fatura.contractKey)) ?? 0) + 1);
    return m;
  }, [todas]);
  const gestores = useMemo(() => listGestores(todas.map(gestorDe)), [todas, contrato]); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => {
    const q = normalizarBusca(filters.busca);
    return todas.filter((l) => {
      const c = contrato(l.fatura.contractKey);
      if (filters.uasg !== TODOS && uasgDaChave(l.fatura.contractKey) !== filters.uasg) return false;
      if (showGestorFilter && !matchesGestorFilter(c.gestorNome, filters.gestor)) return false;
      if (q && !normalizarBusca(l.numeroEmpenho).includes(q) && !normalizarBusca(c.numero).includes(q) && !normalizarBusca(l.fatura.numero ?? '').includes(q) && !normalizarBusca(c.fornecedorNome ?? '').includes(q)) return false;
      return true;
    });
  }, [todas, filters, contrato, showGestorFilter]);

  const colunas = useMemo<Record<string, CarteiraSortColumn<EmpenhoCitadoSemVinculo>>>(
    () => ({
      empenho: { value: (l) => l.numeroEmpenho },
      fatura: { value: (l) => l.fatura.emissao, firstDir: 'desc' },
      contrato: { value: (l) => contrato(l.fatura.contractKey).numero.split('/').reverse().join('/') },
      valor: { value: (l) => l.fatura.valorLiquido, firstDir: 'desc' },
      gestor: { value: (l) => contrato(l.fatura.contractKey).gestorNome }
    }),
    [contrato]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(lista, colunas);
  const sort = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, React.useCallback((l: EmpenhoCitadoSemVinculo) => l.chave, []), PAGE_SIZE);

  const abrirFatura = (l: EmpenhoCitadoSemVinculo) => navigate(`/contratos/${encodeURIComponent(l.fatura.contractKey)}?aba=pagamentos&abrir=${l.fatura.idFatura}`);

  if (faturas.error && !faturas.data) {
    return (
      <PageContainer style={{ padding: '2rem 0' }}>
        <ErrorState title="Erro ao carregar as faturas" message={faturas.error.message} onRetry={() => void faturas.refetch()} />
      </PageContainer>
    );
  }
  const hasActive = hasActiveCarteiraFilters(SCHEMA, filters);
  const isBusy = faturas.isLoading || consultados.isLoading || carregandoContratos;

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <VinculacaoPageHeader title="Empenhos a vincular ao contrato" subtitle="Notas que uma fatura cita, mas que não estão vinculadas ao contrato no sistema." />

      {isBusy ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} aria-busy="true" aria-label="Carregando faturas...">
          <SkeletonLoader variant="rectangular" height="46px" count={1} />
          <SkeletonLoader variant="rectangular" height="300px" count={1} />
        </div>
      ) : (
        <>
          <CarteiraFilterBar
            busca={filters.busca}
            searchPlaceholder="Buscar por empenho, contrato, fatura, fornecedor..."
            onChangeBusca={(v) => setFilter('busca', v)}
            hasActiveFilters={hasActive}
            onResetFilters={resetFilters}
            counter={carteiraCounter(lista.length, todas.length, hasActive, 'nota', 'notas')}
            testIdPrefix="vinc-ne-contrato"
          >
            <CarteiraFilterButton label="UASG" value={filters.uasg} emptyValue={TODOS} options={[...uasgs.keys()].sort().map((u) => ({ value: u, label: u, count: uasgs.get(u) }))} onChange={(v) => setFilter('uasg', v)} testId="vinc-ne-contrato-filter-uasg" />
            {showGestorFilter && <CarteiraGestorSelect value={filters.gestor} gestores={gestores} onChange={(v) => setFilter('gestor', v)} testId="vinc-ne-contrato-filter-gestor" />}
          </CarteiraFilterBar>

          <NoticeBar tone="info" testId="vinc-ne-contrato-aviso">
            Ou a nota falta no contrato (vincule à mão, como no Contrato 360), ou a fatura está no contrato errado (corrija no Contratos.gov.br; a
            sincronização traz a correção). Contratos cujos empenhos ainda não foram consultados não entram.
          </NoticeBar>

          {todas.length === 0 ? (
            <EmptyState title="Nenhuma fatura cita empenho fora do contrato." description="Quando o Contratos.gov.br trouxer uma fatura com nota que não está no contrato, ela aparece aqui." testId="vinc-ne-contrato-vazio" />
          ) : lista.length === 0 ? (
            <CarteiraNoResults title="Nenhuma nota corresponde aos filtros." description="Altere os critérios ou limpe os filtros." onResetFilters={resetFilters} />
          ) : (
            <div data-testid="vinc-ne-contrato-table" className="carteira-shell" style={carteiraTableShell}>
              <div style={{ overflowX: 'auto' }}>
                <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <CarteiraSortHeader label="Empenho citado" sortKey="empenho" {...sort} />
                      <CarteiraSortHeader label="Fatura" sortKey="fatura" {...sort} />
                      <CarteiraSortHeader label="Contrato" sortKey="contrato" {...sort} />
                      <CarteiraSortHeader label="Valor da fatura" sortKey="valor" align="right" {...sort} />
                      {showGestorFilter && <CarteiraSortHeader label="Gestor" sortKey="gestor" {...sort} />}
                      <th style={{ ...carteiraTh, textAlign: 'right' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((l) => {
                      const c = contrato(l.fatura.contractKey);
                      return (
                        <tr key={l.chave} data-testid={`vinc-ne-contrato-row-${l.chave}`} className="carteira-row-link" onClick={abrirAoClicarNaLinha(() => abrirFatura(l))}>
                          <td data-role="id" style={{ ...carteiraTd, minWidth: '150px' }}>
                            <CarteiraIdLink onClick={() => abrirFatura(l)} label={`Ver a fatura que cita ${l.numeroEmpenho}`} title="Abrir a fatura no contrato">
                              {l.numeroEmpenho}
                            </CarteiraIdLink>
                          </td>
                          <td data-label="Fatura" style={carteiraTd}>
                            <strong>{l.fatura.numero || l.fatura.idFatura}</strong>
                            <div style={subtle}>
                              {l.fatura.referencia ? `ref. ${l.fatura.referencia} · ` : ''}
                              {dataBR(l.fatura.emissao)}
                            </div>
                          </td>
                          <td data-label="Contrato" style={{ ...carteiraTd, minWidth: '180px', maxWidth: '300px' }}>
                            <strong>{c.numero}</strong>
                            <div style={carteiraSubtitle} title={c.fornecedorNome}>
                              {c.fornecedorNome ?? '—'}
                            </div>
                          </td>
                          <td data-label="Valor da fatura" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatCurrency(l.fatura.valorLiquido)}</td>
                          {showGestorFilter && (
                            <td data-label="Gestor" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                              {c.gestorNome ?? <span style={{ color: 'var(--color-warning-text)' }}>sem gestor</span>}
                            </td>
                          )}
                          <td data-role="action" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                              {podeVincular && (
                                <ActionButton action="vincular" size="sm" onClick={() => setVinculando(l)} data-testid={`vinc-ne-contrato-vincular-${l.chave}`}>
                                  Vincular ao contrato
                                </ActionButton>
                              )}
                              <AppButton variant="outline" size="sm" onClick={() => window.open(CONTRATOS_GOV, '_blank', 'noopener,noreferrer')} title="Conferir o contrato no portal oficial">
                                Contratos.gov.br
                              </AppButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <CarteiraPagination page={currentPage} pageSize={PAGE_SIZE} total={sorted.length} onChange={setPage} testIdPrefix="vinc-ne-contrato" />
            </div>
          )}
        </>
      )}

      {vinculando && <VincularAoContratoDialog linha={vinculando} contrato={contrato(vinculando.fatura.contractKey)} onFechar={() => setVinculando(null)} />}
    </PageContainer>
  );
};
