import React, { useMemo, useCallback, useState } from 'react';
import { PageContainer } from '../design-system/components/PageContainer';
import { useContractsPortfolio } from '../hooks/useContractsPortfolio';
import { canAssignManager, destinoContratoSemGestor } from '../components/carteira/ManagerAssign';
import { useAllAtaManagers } from '../hooks/useAtaManagers';
import { useContratosSemAta } from '../hooks/useContratosSemAta';
import { formatContractNumber } from '../utils/contractNumber';
import { useAuth } from '../context/AuthContext';
import { useCarteiraItens } from '../hooks/useCarteiraItens';
import { TODAS_UNIDADES } from '../components/carteira/CarteiraExecucaoSelects';
import { ContractsPartialNotice } from '../components/carteira/ContractsPartialNotice';
import { ContractsPortfolioHeader } from '../components/contracts/portfolio/ContractsPortfolioHeader';
import { ContractsPortfolioSummary } from '../components/contracts/portfolio/ContractsPortfolioSummary';
import {
  ContractsPortfolioFilters,
  CONTRACTS_FILTER_SCHEMA,
  type ContractsPortfolioFilterState
} from '../components/contracts/portfolio/ContractsPortfolioFilters';
import { useCarteiraFilters } from '../components/carteira/carteiraFilters';
import { canFilterByGestor, listGestores, matchesGestorFilter } from '../components/carteira/carteiraGestor';
import { ContractsPortfolioTable, type ContractPortfolioRow } from '../components/contracts/portfolio/ContractsPortfolioTable';
import { comparePrazo, matchesStatusFilter } from '../components/carteira/carteiraPrazo';
import { ErrorState } from '../design-system/components/ErrorState';
import { SkeletonLoader } from '../design-system/components/SkeletonLoader';
import { AlocacoesFalhaNotice } from '../components/carteira/AlocacoesFalhaNotice';
import { ConfirmarExecucaoModal } from '../components/contracts/portfolio/ConfirmarExecucaoModal';
import { NoticeBar } from '../design-system/components/NoticeBar';
import { AppButton } from '../design-system/components/AppButton';
import { FontesComFalhaAviso } from '../components/fonte/FontesComFalhaAviso';
import { useLeiturasComFalha } from '../components/fonte/useLeiturasComFalha';
import { podeDecidirExecucao } from '../hooks/useContratosExecucao';
import { estadoDaExecucao, pendenciasDoFechamento } from '../utils/contratoExecutado';
import type { ContractPortfolioRow as Linha } from '../components/contracts/portfolio/ContractsPortfolioTable';

const executado = (r: Linha) => estadoDaExecucao(r.execucao) === 'EXECUTADO';
const sugerido = (r: Linha) => estadoDaExecucao(r.execucao) === 'SUGERIDO';
/** Pendência na Carteira: aviso aberto, escopo cumprido a confirmar ou, no executado, o que falta para fechar. */
const temPendencia = (r: Linha) =>
  sugerido(r) || (executado(r) ? pendenciasDoFechamento(r.execucao).length > 0 : r.pendencias.length > 0);

export const ContractsRoute: React.FC = () => {
  // Dados da carteira (contratos no escopo do usuário, com prazo, gestor e pendências).
  const {
    rows: allRows,
    isLoading,
    isLoadingScope: isLoadingManagers,
    isFetching,
    isPartial,
    fontesComFalha,
    podeForcarAtualizacao,
    error,
    carteiraIncompleta,
    tentarDeNovo,
    dataUpdatedAt,
    refresh,
    leituraDaExecucao
  } = useContractsPortfolio();
  const leiturasDaExecucao = useLeiturasComFalha([leituraDaExecucao]);
  const [execucaoAberta, setExecucaoAberta] = useState<string | null>(null);
  const { role } = useAuth();
  // Unidades internas de cada contrato: as que receberam alocação de algum item vinculado a ele.
  const { unidades, unidadesDoContrato, alocacoesComErro, recarregandoAlocacoes, recarregarAlocacoes } = useCarteiraItens({ apenasUnidadesDeContratos: true });

  // Filtros na URL (?situacao=&pendencia=&gestor=&busca=): sobrevivem à ida ao detalhe e permitem link já filtrado.
  const { filters: filterState, setFilter: handleFilterChange, resetFilters: handleResetFilters } =
    useCarteiraFilters(CONTRACTS_FILTER_SCHEMA);

  const handleSelectStatus = useCallback(
    (status: ContractsPortfolioFilterState['status']) => handleFilterChange('status', status),
    [handleFilterChange]
  );
  // O perfil "gestor" já vê só os próprios contratos: sem seletor, e um ?gestor= na URL é ignorado.
  const showGestorFilter = canFilterByGestor(role);

  // Escopo cumprido: o gestor do contrato e o coordenador confirmam (o banco confere o alcance).
  const podeDecidir = podeDecidirExecucao(role);

  // A atribuição de gestor é só na Central de Distribuição; aqui o coordenador tem o atalho até lá.
  const canAssign = canAssignManager(role);

  // "Sem gestor" leva a quem resolve: o contrato herda o gestor da ata (Central) ou ainda precisa de ata (Vínculos).
  const { data: ataManagers } = useAllAtaManagers();
  const { data: confirmacoesSemAta } = useContratosSemAta();
  const destinoSemGestor = useCallback(
    (row: ContractPortfolioRow) =>
      destinoContratoSemGestor({
        numero: formatContractNumber(row.contract),
        atas: row.atas ?? [],
        naoPertenceAAta: Boolean(confirmacoesSemAta?.[row.contractKey]),
        ataTemGestor: (numeroAta) => Boolean(ataManagers?.[numeroAta]?.gestorNome)
      }),
    [ataManagers, confirmacoesSemAta]
  );

  // Contagens dos segmentos de situação e valor vigente, sobre toda a carteira visível (independentes dos filtros).
  const summaryMetrics = useMemo(() => {
    let vigentes = 0;
    let criticos = 0;
    let atencao = 0;
    let historico = 0;
    let executados = 0;
    let valorVigenteTotal = 0;
    for (const row of allRows) {
      const { contract, faixa } = row;
      if (faixa === 'EXPIRADO') historico++;
      // Escopo cumprido confirmado: fora de Vigentes, Atenção, Crítico e do valor vigente.
      else if (executado(row)) executados++;
      else if (faixa !== 'SEM_DATA') {
        vigentes++;
        valorVigenteTotal += contract.valorGlobal || contract.valorInicial || 0;
        if (faixa === 'CRITICO') criticos++;
        else if (faixa === 'ATENCAO') atencao++;
      }
    }
    const sugeridos = allRows.filter((r) => sugerido(r) && r.faixa !== 'EXPIRADO').length;
    return { vigentes, criticos, atencao, historico, executados, sugeridos, valorVigenteTotal };
  }, [allRows]);

  const linhaDaExecucao = execucaoAberta ? allRows.find((r) => r.contractKey === execucaoAberta) : undefined;

  const gestoresDisponiveis = useMemo(() => listGestores(allRows.map((r) => r.gestorNome)), [allRows]);

  const filteredRows = useMemo(() => {
    const query = filterState.busca.trim().toLowerCase();
    const queryDigits = query.replace(/\D/g, '');

    return allRows
      .filter((row) => {
        const { contract, contractKey, faixa, gestorNome, atas } = row;
        if (!matchesStatusFilter(faixa, filterState.status, executado(row))) return false;
        if (filterState.pendencia === 'COM_PENDENCIA' && !temPendencia(row)) return false;
        if (filterState.unidade !== TODAS_UNIDADES && !unidadesDoContrato.get(contractKey)?.has(filterState.unidade)) return false;
        if (showGestorFilter && !matchesGestorFilter(gestorNome, filterState.gestor)) return false;

        if (query) {
          const fornCnpj = String(contract.fornecedorCnpjCpf || '').replace(/\D/g, '');
          const matchesQuery =
            String(contract.numero || '').toLowerCase().includes(query) ||
            String(contract.ano || '').toLowerCase().includes(query) ||
            String(contract.numeroFormatado || '').toLowerCase().includes(query) ||
            String(contract.fornecedorNome || '').toLowerCase().includes(query) ||
            (atas || []).some((ata) => ata.toLowerCase().includes(query)) ||
            (queryDigits.length >= 3 && fornCnpj.includes(queryDigits)) ||
            String(contract.objeto || '').toLowerCase().includes(query);
          if (!matchesQuery) return false;
        }
        return true;
      })
      .sort((a, b) => comparePrazo(a.diasRestantes, b.diasRestantes));
  }, [allRows, filterState, showGestorFilter, unidadesDoContrato]);


  // Uma UASG que não carregou deixaria a carteira pela metade: mostra o erro em vez da lista parcial ou vazia.
  if (carteiraIncompleta) {
    return (
      <PageContainer style={{ padding: '2rem 0' }}>
        <ErrorState
          title="Erro ao carregar carteira de contratos"
          message={error?.message || 'Não foi possível buscar a lista de contratos administrativos.'}
          onRetry={() => void tentarDeNovo()}
          retryLabel={isFetching ? 'Tentando…' : undefined}
        />
      </PageContainer>
    );
  }

  // Os cards só aparecem com todos os dados carregados: evita mostrar totais
  // parciais (ex.: "1 vigente") enquanto a segunda UASG ainda está chegando.
  const isBusy = isLoading || (role === 'gestor' && isLoadingManagers);

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <ContractsPortfolioHeader
        // Só o coordenador atualiza com as fontes oficiais; os demais perfis já leem o banco atualizado.
        onRefresh={podeForcarAtualizacao ? () => void refresh() : undefined}
        isRefreshing={isFetching}
        lastUpdated={dataUpdatedAt}
      />

      {isBusy ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <SkeletonLoader variant="card" height="96px" count={1} />
          <SkeletonLoader variant="rectangular" height="46px" count={1} />
          <SkeletonLoader variant="rectangular" height="300px" count={1} />
        </div>
      ) : (
        <>
          {isPartial && (
            <ContractsPartialNotice
              fontesComFalha={fontesComFalha}
              ultimoSucessoEm={typeof dataUpdatedAt === 'string' ? dataUpdatedAt : null}
              onRetry={podeForcarAtualizacao ? () => void refresh() : undefined}
              isRetrying={isFetching}
            />
          )}

          {alocacoesComErro && <AlocacoesFalhaNotice onRetry={recarregarAlocacoes} isRetrying={recarregandoAlocacoes} />}

          <FontesComFalhaAviso
            falhas={leiturasDaExecucao.falhas}
            onTentar={() => void leiturasDaExecucao.tentarDeNovo()}
            tentando={leiturasDaExecucao.tentando}
            onde="da carteira"
            testIdPrefix="contracts-execucao-fontes"
          />

          {summaryMetrics.sugeridos > 0 && podeDecidir && (
            <NoticeBar
              tone="info"
              testId="contracts-aviso-escopo-cumprido"
              action={
                <AppButton
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    handleFilterChange('status', 'VIGENTES');
                    handleFilterChange('pendencia', 'COM_PENDENCIA');
                  }}
                >
                  Ver quais
                </AppButton>
              }
            >
              {summaryMetrics.sugeridos === 1 ? '1 contrato vigente tem' : `${summaryMetrics.sugeridos} contratos vigentes têm`} as faturas pagas
              somando o valor do contrato. Confirme o escopo cumprido para tirá-los dos avisos de prorrogação.
            </NoticeBar>
          )}

          <ContractsPortfolioSummary
            vigentes={summaryMetrics.vigentes}
            criticos={summaryMetrics.criticos}
            atencao={summaryMetrics.atencao}
            historico={summaryMetrics.historico}
            executados={summaryMetrics.executados}
            totalContratos={allRows.length}
            valorVigenteTotal={summaryMetrics.valorVigenteTotal}
            activeStatus={filterState.status}
            onSelectStatus={handleSelectStatus}
          />

          <ContractsPortfolioFilters
            filters={filterState}
            gestores={gestoresDisponiveis}
            unidades={unidades}
            comPendencia={allRows.filter((r) => temPendencia(r) && matchesStatusFilter(r.faixa, filterState.status, executado(r))).length}
            showGestorFilter={showGestorFilter}
            onChangeFilter={handleFilterChange}
            onResetFilters={handleResetFilters}
            totalFiltered={filteredRows.length}
            totalContracts={allRows.length}
          />

          <ContractsPortfolioTable
            rows={filteredRows}
            totalContracts={allRows.length}
            onResetFilters={handleResetFilters}
            canAssign={canAssign}
            destinoSemGestor={destinoSemGestor}
            onFilter={handleFilterChange}
            onConfirmarExecucao={podeDecidir ? (row) => setExecucaoAberta(row.contractKey) : undefined}
          />

          <ConfirmarExecucaoModal
            isOpen={Boolean(linhaDaExecucao)}
            numero={linhaDaExecucao ? formatContractNumber(linhaDaExecucao.contract) : ''}
            fornecedor={linhaDaExecucao?.contract.fornecedorNome}
            execucao={linhaDaExecucao?.execucao}
            onClose={() => setExecucaoAberta(null)}
          />
        </>
      )}
    </PageContainer>
  );
};
