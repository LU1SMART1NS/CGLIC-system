import React, { useCallback, useMemo, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { ActionButton } from '../../design-system/components/ActionButton';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../design-system/components/ErrorState';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { useAuth } from '../../context/AuthContext';
import { useAtasPortfolio } from '../../hooks/useAtasPortfolio';
import { useCarteiraItens } from '../../hooks/useCarteiraItens';
import { buildAtaItemPath } from '../../hooks/useAta';
import { CarteiraSituacaoTabs } from '../carteira/CarteiraSituacaoTabs';
import { useCarteiraFilters } from '../carteira/carteiraFilters';
import { canFilterByGestor, listGestores, matchesGestorFilter } from '../carteira/carteiraGestor';
import { comparePrazo, matchesStatusFilter, type CarteiraStatusFilter } from '../carteira/carteiraPrazo';
import { TODAS_UNIDADES } from '../carteira/CarteiraExecucaoSelects';
import { formatCurrency } from '../carteira/carteiraFormat';
import { ExportExcelModal } from '../modals/ExportExcelModal';
import { passaFiltroNivel, type NivelAtendimento } from '../../utils/itemAtendimento';
import type { CarteiraItemRow } from '../../utils/carteiraItens';
import { ItensPortfolioFilters, ITENS_FILTER_SCHEMA } from './ItensPortfolioFilters';
import { ItensPortfolioTable } from './ItensPortfolioTable';

/**
 * Carteira → Itens: todos os itens das atas com vigência da ata, alocação por unidade interna (contra o
 * quantitativo SENASP) e empenho (contra a quantidade contratada). Mesma moldura das abas Atas e Contratos.
 */
export const ItensPortfolio: React.FC = () => {
  const navigateToDetail = useNavigateWithOrigin();
  const { role } = useAuth();
  const showGestorFilter = canFilterByGestor(role);

  const { arps, scopedArps, isLoading, scopeLoading, itemsByAta, gestorByAta, syncError, reload } = useAtasPortfolio();
  const { rows, unidades, isLoading: loadingExecucao } = useCarteiraItens({ arps: scopedArps, itemsByAta, gestorByAta });

  const { filters, setFilter, resetFilters } = useCarteiraFilters(ITENS_FILTER_SCHEMA);
  const [isExportOpen, setIsExportOpen] = useState(false);

  const unidadeNome = unidades.find((u) => u.chave === filters.unidade)?.nome;
  const gestoresDisponiveis = useMemo(() => listGestores(rows.map((r) => r.gestorNome)), [rows]);

  // Cards de vigência (da ata do item): sobre toda a carteira visível, independentes dos filtros.
  const resumoVigencia = useMemo(() => {
    let vigentes = 0;
    let criticos = 0;
    let atencao = 0;
    let historico = 0;
    for (const { faixa } of rows) {
      if (faixa === 'EXPIRADO') historico++;
      else if (faixa === 'SEM_DATA') continue;
      else {
        vigentes++;
        if (faixa === 'CRITICO') criticos++;
        else if (faixa === 'ATENCAO') atencao++;
      }
    }
    return { vigentes, criticos, atencao, historico };
  }, [rows]);

  // Tudo menos alocação e empenho: base da contagem de cada nível nos menus desses filtros.
  const baseRows = useMemo(() => {
    const query = filters.busca.trim().toLowerCase();
    const queryDigits = query.replace(/\D/g, '');
    return rows.filter((r) => {
      if (!matchesStatusFilter(r.faixa, filters.statusVigencia)) return false;
      if (filters.unidade !== TODAS_UNIDADES && !(r.alocadoPorUnidade[filters.unidade] > 0)) return false;
      if (showGestorFilter && !matchesGestorFilter(r.gestorNome, filters.gestor)) return false;
      if (query) {
        const { item, arp } = r;
        const cnpj = (item.niFornecedor || '').replace(/\D/g, '');
        const casa =
          (arp.numeroAtaRegistroPreco || '').toLowerCase().includes(query) ||
          String(item.numeroItem).toLowerCase().includes(query) ||
          (item.descricaoItem || '').toLowerCase().includes(query) ||
          (item.nomeRazaoSocialFornecedor || '').toLowerCase().includes(query) ||
          (queryDigits.length >= 3 && cnpj.includes(queryDigits));
        if (!casa) return false;
      }
      return true;
    });
  }, [rows, filters.busca, filters.statusVigencia, filters.unidade, filters.gestor, showGestorFilter]);

  const lista = useMemo(
    () =>
      baseRows
        .filter(
          (r) =>
            passaFiltroNivel(r.nivelAlocacao, filters.filtroAlocacao) && passaFiltroNivel(r.nivelEmpenho, filters.filtroEmpenho)
        )
        .sort(
          (a, b) =>
            comparePrazo(a.diasRestantes, b.diasRestantes) ||
            a.arp.numeroAtaRegistroPreco.localeCompare(b.arp.numeroAtaRegistroPreco) ||
            Number(a.item.numeroItem) - Number(b.item.numeroItem)
        ),
    [baseRows, filters.filtroAlocacao, filters.filtroEmpenho]
  );

  // Quantos itens (com os demais filtros) cairiam em cada nível de alocação / empenho: contagem no menu do filtro.
  const nivelCounts = useMemo(() => {
    const alocacao: Partial<Record<NivelAtendimento, number>> = {};
    const empenho: Partial<Record<NivelAtendimento, number>> = {};
    for (const r of baseRows) {
      alocacao[r.nivelAlocacao] = (alocacao[r.nivelAlocacao] ?? 0) + 1;
      empenho[r.nivelEmpenho] = (empenho[r.nivelEmpenho] ?? 0) + 1;
    }
    return { alocacao, empenho };
  }, [baseRows]);

  // Faixa da unidade: o que a unidade recebeu, em reais (somar quantidades de itens diferentes não faz sentido).
  const resumoUnidade = useMemo(() => {
    if (filters.unidade === TODAS_UNIDADES) return null;
    let valor = 0;
    for (const r of lista) valor += (r.alocadoPorUnidade[filters.unidade] ?? 0) * (Number(r.item.valorUnitario) || 0);
    return { itens: lista.length, valor };
  }, [lista, filters.unidade]);

  const handleSelectStatus = useCallback(
    (status: CarteiraStatusFilter | 'TODOS') => setFilter('statusVigencia', status),
    [setFilter]
  );

  const abrirItem = (row: CarteiraItemRow) =>
    navigateToDetail(buildAtaItemPath(row.arp.numeroAtaRegistroPreco, row.arp.codigoUnidadeGerenciadora, row.item.numeroItem));

  if (syncError && arps.length === 0) {
    return (
      <PageContainer style={{ padding: '2rem 0' }}>
        <ErrorState title="Erro ao carregar os itens da carteira" message={syncError} onRetry={() => reload()} />
      </PageContainer>
    );
  }

  const isBusy = (isLoading && arps.length === 0) || scopeLoading || loadingExecucao;

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Carteira de Itens"
        subtitle="Itens de todas as atas, com alocação por unidade interna e empenho."
        icon={<ListChecks size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <>
            <ActionButton action="exportar" label="Exportar Relatório" onClick={() => setIsExportOpen(true)} data-testid="itens-export-btn" />
          </>
        }
      />

      {isBusy ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} aria-busy="true" aria-label="Carregando itens...">
          <SkeletonLoader variant="card" height="96px" count={1} />
          <SkeletonLoader variant="rectangular" height="46px" count={1} />
          <SkeletonLoader variant="rectangular" height="300px" count={1} />
        </div>
      ) : (
        <>
          <CarteiraSituacaoTabs
            testIdPrefix="itens"
            vigentes={resumoVigencia.vigentes}
            criticos={resumoVigencia.criticos}
            atencao={resumoVigencia.atencao}
            historico={resumoVigencia.historico}
            total={rows.length}
            active={filters.statusVigencia}
            onSelect={handleSelectStatus}
          />

          {resumoUnidade && (
            <div
              data-testid="itens-faixa-unidade"
              style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem 2rem', alignItems: 'center', background: '#e0e7f5', border: '1px solid var(--primary)', borderRadius: '10px', padding: '0.75rem 1rem' }}
            >
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>{unidadeNome ?? filters.unidade}</div>
                <div style={{ fontSize: '0.75rem', color: '#475569' }}>Unidade interna selecionada</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#475569' }}>Itens alocados</div>
                <div style={{ fontWeight: 800 }}>{resumoUnidade.itens}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#475569' }}>Valor alocado</div>
                <div style={{ fontWeight: 800 }}>{formatCurrency(resumoUnidade.valor)}</div>
              </div>
            </div>
          )}

          <ItensPortfolioFilters
            filters={filters}
            gestores={gestoresDisponiveis}
            unidades={unidades}
            alocacaoCounts={nivelCounts.alocacao}
            empenhoCounts={nivelCounts.empenho}
            showGestorFilter={showGestorFilter}
            onChangeFilter={setFilter}
            onResetFilters={resetFilters}
            totalFiltered={lista.length}
            totalItens={rows.length}
          />

          <ItensPortfolioTable
            rows={lista}
            totalItens={rows.length}
            unidade={filters.unidade}
            unidadeNome={unidadeNome}
            onSelectItem={abrirItem}
            onFilter={setFilter}
            canFilterGestor={showGestorFilter}
            onResetFilters={resetFilters}
          />
        </>
      )}

      <ExportExcelModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} atas={scopedArps} itemsByAta={itemsByAta} />
    </PageContainer>
  );
};
