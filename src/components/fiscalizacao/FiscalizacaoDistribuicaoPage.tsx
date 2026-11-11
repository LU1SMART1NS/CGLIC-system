import React, { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UsersRound } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { AppButton } from '../../design-system/components/AppButton';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { colors } from '../../design-system/tokens';
import { useContratosFiscalizacao, useFiscaisAtivos, useTransferenciasFiscalizacao } from '../../hooks/useFiscalizacao';
import type { ContratoFiscalizacao } from '../../services/fiscalizacaoService';
import { NOME_SFC, cargaPorFiscal, deEmenda, numeroDoContrato, segmentoDoContrato, type SegmentoDistribuicao } from '../../utils/fiscalizacao';
import { ContratosFiscalizacaoTabela } from './ContratosFiscalizacaoTabela';
import { DefinirFiscalizacaoModal } from './FiscalizacaoModais';
import { FiscaisEquipe } from './FiscaisEquipe';

const POR_PAGINA = 25;
/** Abas no desenho da Distribuição de Atas e Contratos: primeiro a Equipe, depois as filas de contratos. */
type Aba = 'EQUIPE' | SegmentoDistribuicao;
const ABAS: Aba[] = ['EQUIPE', 'A_DEFINIR', 'SFC', 'MISTA', 'AREA', 'TODOS'];

/**
 * Início › Fiscalização › Distribuição (só o coordenador): quem fiscaliza cada contrato vigente e o fiscal da SFC/CGLIC.
 * A aba Equipe vem primeiro, como em Atas e Contratos; a página abre em "A definir" enquanto houver contrato a definir.
 * Contrato de emenda chega "A definir" (sugestão SFC/CGLIC); sem emenda fica com a área requisitante até o coordenador
 * decidir o contrário (migration 259).
 */
export const FiscalizacaoDistribuicaoPage: React.FC = () => {
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useContratosFiscalizacao();
  const { fiscais } = useFiscaisAtivos();
  const transferencias = useTransferenciasFiscalizacao();
  const [params, setParams] = useSearchParams();
  const contratos = useMemo(() => data ?? [], [data]);
  const aDefinir = contratos.filter((c) => segmentoDoContrato(c) === 'A_DEFINIR').length;
  const pedida = params.get('segmento') ?? '';
  const aba: Aba = (ABAS as string[]).includes(pedida) ? (pedida as Aba) : isLoading || aDefinir > 0 ? 'A_DEFINIR' : 'EQUIPE';
  const seg: SegmentoDistribuicao = aba === 'EQUIPE' ? 'TODOS' : aba;
  const [busca, setBusca] = useState('');
  const [fiscal, setFiscal] = useState('');
  const [origem, setOrigem] = useState('');
  const [editando, setEditando] = useState<ContratoFiscalizacao | null>(null);

  const conta = (s: SegmentoDistribuicao) => contratos.filter((c) => s === 'TODOS' || segmentoDoContrato(c) === s).length;
  const doSeg = useMemo(() => contratos.filter((c) => seg === 'TODOS' || segmentoDoContrato(c) === seg), [contratos, seg]);
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return doSeg
      .filter(
        (c) =>
          (!q || `${numeroDoContrato(c)} ${c.fornecedor ?? ''} ${c.emendas.join(' ')} ${c.fiscalNome ?? ''}`.toLowerCase().includes(q)) &&
          (!fiscal || c.fiscalUserId === fiscal) &&
          (!origem || (origem === 'EMENDA' ? deEmenda(c) : !deEmenda(c)))
      )
      .sort((a, b) => (b.assinatura ?? '').localeCompare(a.assinatura ?? ''));
  }, [doSeg, busca, fiscal, origem]);
  const ativos = Boolean(busca || fiscal || origem);
  const chave = useCallback((c: ContratoFiscalizacao) => c.contractKey, []);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(filtrados, chave, POR_PAGINA);
  const carga = useMemo(() => cargaPorFiscal(contratos, fiscais), [contratos, fiscais]);


  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Distribuição"
        subtitle={`O coordenador decide quem fiscaliza cada contrato e escolhe o fiscal da ${NOME_SFC}.`}
        hint={`Contrato de emenda chega "A definir", com sugestão ${NOME_SFC}. Contrato sem emenda fica com a área requisitante, salvo decisão do coordenador, que pede motivo. A fiscalização pode ser mista: parte das entregas com a ${NOME_SFC} e parte com a área requisitante.`}
        icon={<UsersRound size={26} color="var(--primary)" aria-hidden="true" />}
        actions={<HeaderRefreshAction onRefresh={() => refetch()} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="fisc-dist-atualizar" tooltipTitle="Recarregar os contratos" />}
      />
      <CarteiraSegmentTabs<Aba>
        testIdPrefix="fisc-dist"
        ariaLabel="Equipe e quem fiscaliza"
        active={aba}
        onSelect={(s) => setParams({ segmento: s }, { replace: true })}
        segments={[
          { id: 'EQUIPE', label: 'Equipe', count: carga.length, title: 'Carga de cada fiscal' },
          { id: 'A_DEFINIR', label: 'A definir', count: conta('A_DEFINIR'), dot: 'var(--color-warning-solid)' },
          { id: 'SFC', label: NOME_SFC, count: conta('SFC'), dot: 'var(--primary)' },
          { id: 'MISTA', label: 'Mista', count: conta('MISTA'), dot: colors.semantic.purple.solid },
          { id: 'AREA', label: 'Área requisitante', count: conta('AREA'), dot: colors.semantic.neutral.solid },
          { id: 'TODOS', label: 'Todos', count: conta('TODOS') }
        ]}
      />
      {aba === 'EQUIPE' ? (
        <FiscaisEquipe carga={carga} contratos={contratos} transferencias={transferencias.data ?? []} />
      ) : (
      <>
      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar por contrato, fornecedor, emenda ou fiscal..."
        onChangeBusca={setBusca}
        hasActiveFilters={ativos}
        onResetFilters={() => { setBusca(''); setFiscal(''); setOrigem(''); }}
        counter={carteiraCounter(filtrados.length, doSeg.length, ativos, 'contrato', 'contratos')}
        testIdPrefix="fisc-dist"
      >
        <CarteiraFilterButton label="Origem" value={origem} emptyValue="" options={[{ value: 'EMENDA', label: 'Com emenda', count: doSeg.filter(deEmenda).length }, { value: 'SEM', label: 'Sem emenda', count: doSeg.filter((c) => !deEmenda(c)).length }]} onChange={setOrigem} testId="fisc-dist-filtro-origem" />
        <CarteiraFilterButton label="Fiscal" value={fiscal} emptyValue="" options={fiscais.map((f) => ({ value: f.id, label: f.nome, count: doSeg.filter((c) => c.fiscalUserId === f.id).length }))} onChange={setFiscal} testId="fisc-dist-filtro-fiscal" />
      </CarteiraFilterBar>
      <AdminListShell
        testId="fisc-dist-lista"
        isLoading={isLoading}
        isError={isError}
        errorTitle="Não foi possível carregar os contratos"
        errorMessage={error?.message || 'Falha ao consultar a fiscalização dos contratos.'}
        onRetry={() => refetch()}
        isEmpty={!isLoading && filtrados.length === 0}
        emptyTitle={seg === 'A_DEFINIR' ? 'Nenhum contrato de emenda a definir.' : 'Nenhum contrato nesta situação.'}
        emptyDescription={seg === 'A_DEFINIR' ? 'Quando um contrato de emenda chegar do Contratos.gov.br, ele aparece aqui.' : 'Ajuste a busca ou escolha outra situação.'}
      >
        <ContratosFiscalizacaoTabela
          contratos={pageItems}
          testId="fisc-dist-tabela"
          rowActions={(c) => (
            <AppButton variant="outline" size="sm" onClick={() => setEditando(c)} data-testid={`fisc-dist-definir-${c.contractKey}`}>
              {c.situacao === 'A_DEFINIR' || c.situacao === 'AREA_PADRAO' ? 'Definir' : 'Alterar'}
            </AppButton>
          )}
        />
        <CarteiraPagination page={currentPage} pageSize={POR_PAGINA} total={filtrados.length} onChange={setPage} testIdPrefix="fisc-dist" />
      </AdminListShell>
      </>
      )}
      {editando && <DefinirFiscalizacaoModal key={editando.contractKey} contrato={editando} onClose={() => setEditando(null)} />}
    </PageContainer>
  );
};
