import React, { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PackageCheck } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { colors } from '../../design-system/tokens';
import { useAuth } from '../../context/AuthContext';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { useEntregasFiscalizacao, useFiscaisAtivos } from '../../hooks/useFiscalizacao';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { NOME_SFC, rotaDoContrato } from '../../utils/fiscalizacao';
import { FASES_ENTREGA, etapaDef, nomeDoItem, prazoDaEntrega, rotuloDoBeneficiario, type FaseEntrega, type TomPrazo } from '../../utils/fiscalizacaoEntregas';
import { EntregasTabela } from './EntregasTabela';

const POR_PAGINA = 25;
type Segmento = Exclude<FaseEntrega, 'FINALIZADO'> | 'TODAS' | 'FINALIZADO';
const SEGMENTOS: Segmento[] = ['PREPARACAO', 'EXECUCAO', 'RECEBIMENTO', 'PAGAMENTO', 'TODAS', 'FINALIZADO'];
const PONTO: Record<string, string> = { PREPARACAO: colors.semantic.neutral.solid, EXECUCAO: 'var(--primary)', RECEBIMENTO: 'var(--color-warning-solid)', PAGAMENTO: 'var(--color-success)' };

/** Fase da entrega no trilho; a da área requisitante não tem etapa e só aparece em Todas. */
const faseDa = (e: EntregaFiscalizacao): FaseEntrega | null => (e.responsavel === 'AREA' ? null : etapaDef(e.etapa).fase);

const COMO_SUBSTITUTO = 'substituto:';

/**
 * Fiscalização › Entregas (migration 260): cada linha é um item de um contrato para um beneficiário. O gestor de
 * fiscalização abre filtrado pelos contratos em que é o titular; a linha abre o Contrato 360 na aba Fiscalização.
 */
export const FiscalizacaoEntregasPage: React.FC = () => {
  const { user, role } = useAuth();
  const navigate = useNavigateWithOrigin();
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useEntregasFiscalizacao(null);
  const { fiscais } = useFiscaisAtivos();
  const [params, setParams] = useSearchParams();
  const seg: Segmento = (SEGMENTOS as string[]).includes(params.get('fase') ?? '') ? (params.get('fase') as Segmento) : 'TODAS';
  const [busca, setBusca] = useState('');
  const [fiscal, setFiscal] = useState(() => (role === 'gestor_fiscalizacao' && user?.id ? user.id : ''));
  const [prazo, setPrazo] = useState<string>(params.get('prazo') ?? '');
  const [quem, setQuem] = useState('');
  const [uf, setUf] = useState('');
  const entregas = useMemo(() => data ?? [], [data]);

  // Fiscal = titular; o substituto vê as dele só se escolher "Você como substituto" (não são pendências dele).
  const doFiscal = useMemo(
    () => entregas.filter((e) => !fiscal || (fiscal.startsWith(COMO_SUBSTITUTO) ? e.substitutoUserId === fiscal.slice(COMO_SUBSTITUTO.length) : e.fiscalUserId === fiscal)),
    [entregas, fiscal]
  );
  const minhasComoSubstituto = user?.id ? entregas.filter((e) => e.substitutoUserId === user.id).length : 0;
  const opcoesFiscal = [
    ...fiscais.map((f) => ({ value: f.id, label: f.id === user?.id ? `${f.nome} (você)` : f.nome, count: entregas.filter((e) => e.fiscalUserId === f.id).length })),
    ...(minhasComoSubstituto ? [{ value: `${COMO_SUBSTITUTO}${user?.id ?? ''}`, label: 'Você como substituto', count: minhasComoSubstituto }] : [])
  ];
  const conta = (s: Segmento) => doFiscal.filter((e) => s === 'TODAS' || faseDa(e) === s).length;
  const doSeg = useMemo(() => doFiscal.filter((e) => seg === 'TODAS' || faseDa(e) === seg), [doFiscal, seg]);
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return doSeg
      .filter((e) => {
        if (q && !`${e.contratoNumero} ${e.fornecedor ?? ''} ${nomeDoItem(e)} ${rotuloDoBeneficiario(e).principal} ${e.beneficiarioNome ?? ''} ${e.emenda ?? ''} ${e.municipio ?? ''}`.toLowerCase().includes(q)) return false;
        if (prazo && prazoDaEntrega(e).tom !== (prazo as TomPrazo)) return false;
        if (quem && e.responsavel !== quem) return false;
        if (uf && e.uf !== uf) return false;
        return true;
      })
      .sort((a, b) => {
        const pa = prazoDaEntrega(a).dias ?? 99999;
        const pb = prazoDaEntrega(b).dias ?? 99999;
        return pa - pb || a.contratoNumero.localeCompare(b.contratoNumero);
      });
  }, [doSeg, busca, prazo, quem, uf]);
  const ativos = Boolean(busca || prazo || quem || uf || (fiscal && role !== 'gestor_fiscalizacao'));
  const chave = useCallback((e: EntregaFiscalizacao) => e.id, []);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(filtradas, chave, POR_PAGINA);
  const ufs = useMemo(() => [...new Set(doSeg.map((e) => e.uf).filter((x): x is string => Boolean(x)))].sort(), [doSeg]);
  const contaPrazo = (t: TomPrazo) => doSeg.filter((e) => prazoDaEntrega(e).tom === t).length;

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Entregas"
        subtitle={`Cada linha é um item de um contrato para um beneficiário, do pedido de informações ao Ofício à SAL.`}
        hint={`As entregas de emenda nascem das linhas do pedido quando o contrato fica com a ${NOME_SFC}. O endereço é o de entrega do cadastro do beneficiário. O prazo conta pela data prevista da entrega. Faturado e pago vêm das notas, como no Financeiro.`}
        icon={<PackageCheck size={26} color="var(--primary)" aria-hidden="true" />}
        actions={<HeaderRefreshAction onRefresh={() => refetch()} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="fisc-entregas-atualizar" tooltipTitle="Recarregar as entregas" />}
      />
      <CarteiraSegmentTabs<Segmento>
        testIdPrefix="fisc-entregas-fase"
        ariaLabel="Fase das entregas"
        active={seg}
        onSelect={(s) => setParams(s === 'TODAS' ? {} : { fase: s }, { replace: true })}
        segments={[
          ...FASES_ENTREGA.map((f) => ({ id: f.id as Segmento, label: f.nome, count: conta(f.id), dot: PONTO[f.id] })),
          { id: 'TODAS', label: 'Todas', count: conta('TODAS') },
          { id: 'FINALIZADO', label: 'Finalizadas', count: conta('FINALIZADO') }
        ]}
      />
      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar por contrato, item, beneficiário, cidade ou emenda..."
        onChangeBusca={setBusca}
        hasActiveFilters={ativos}
        onResetFilters={() => { setBusca(''); setPrazo(''); setQuem(''); setUf(''); setFiscal(role === 'gestor_fiscalizacao' && user?.id ? user.id : ''); }}
        counter={carteiraCounter(filtradas.length, doSeg.length, ativos, 'entrega', 'entregas')}
        testIdPrefix="fisc-entregas"
      >
        <CarteiraFilterButton label="Fiscal" value={fiscal} emptyValue="" options={opcoesFiscal} onChange={setFiscal} testId="fisc-entregas-filtro-fiscal" />
        <CarteiraFilterButton label="Prazo" value={prazo} emptyValue="" options={[{ value: 'danger', label: 'Vencidas', count: contaPrazo('danger') }, { value: 'warning', label: 'Vencem em 30 dias ou com atraso', count: contaPrazo('warning') }, { value: 'neutral', label: 'No prazo ou sem data', count: contaPrazo('neutral') }, { value: 'success', label: 'Entregues', count: contaPrazo('success') }]} onChange={setPrazo} testId="fisc-entregas-filtro-prazo" />
        <CarteiraFilterButton label="Fiscalização" value={quem} emptyValue="" options={[{ value: 'SFC', label: NOME_SFC, count: doSeg.filter((e) => e.responsavel === 'SFC').length }, { value: 'AREA', label: 'Área requisitante', count: doSeg.filter((e) => e.responsavel === 'AREA').length }]} onChange={setQuem} testId="fisc-entregas-filtro-quem" />
        <CarteiraFilterButton label="UF" value={uf} emptyValue="" options={ufs.map((u) => ({ value: u, label: u, count: doSeg.filter((e) => e.uf === u).length }))} onChange={setUf} testId="fisc-entregas-filtro-uf" />
      </CarteiraFilterBar>
      <AdminListShell
        testId="fisc-entregas-lista"
        isLoading={isLoading}
        isError={isError}
        errorTitle="Não foi possível carregar as entregas"
        errorMessage={error?.message || 'Falha ao consultar as entregas.'}
        onRetry={() => refetch()}
        isEmpty={!isLoading && filtradas.length === 0}
        emptyTitle={entregas.length === 0 ? 'Nenhuma entrega ainda.' : 'Nenhuma entrega nesta situação.'}
        emptyDescription={entregas.length === 0 ? `As entregas aparecem quando o coordenador põe um contrato de emenda com a ${NOME_SFC} (Início › Fiscalização › Distribuição).` : 'Ajuste a busca ou os filtros.'}
      >
        <EntregasTabela entregas={pageItems} testId="fisc-entregas-tabela" comContrato abrir={(e) => navigate(rotaDoContrato(e))} />
        <CarteiraPagination page={currentPage} pageSize={POR_PAGINA} total={filtradas.length} onChange={setPage} testIdPrefix="fisc-entregas" />
      </AdminListShell>
    </PageContainer>
  );
};
