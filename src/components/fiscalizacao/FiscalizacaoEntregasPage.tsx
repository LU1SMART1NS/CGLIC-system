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
import { useAuth } from '../../context/AuthContext';
import { useEntregasFiscalizacao, useFiscaisAtivos } from '../../hooks/useFiscalizacao';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { NOME_SFC, fiscaisVisiveis } from '../../utils/fiscalizacao';
import { FASES_ENTREGA, etapaDef, nomeDoItem, prazoDaEntrega, rotuloDoBeneficiario, type FaseEntrega } from '../../utils/fiscalizacaoEntregas';
import { comQuemEstaOItem } from '../../utils/fiscalizacaoMesa';
import { EntregasTabela } from './EntregasTabela';
import { JanelaDoItem } from './JanelaDoItem';

const POR_PAGINA = 25;
type Segmento = 'VOCE' | 'OUTROS' | 'TODAS' | 'FINALIZADO';
const SEGMENTOS: Segmento[] = ['VOCE', 'OUTROS', 'TODAS', 'FINALIZADO'];
const LADO: Record<'VOCE' | 'OUTROS' | 'FIM', Segmento> = { VOCE: 'VOCE', OUTROS: 'OUTROS', FIM: 'FINALIZADO' };
/** Prazo do item como na aba Contratos: vencido, vence em 15 dias, em dia ou sem prazo, entregue. */
const faixaDoPrazo = (e: EntregaFiscalizacao): string => {
  if (e.entregueEm || e.responsavel === 'AREA') return 'entregue';
  const d = prazoDaEntrega(e).dias;
  return d == null ? 'neutral' : d < 0 ? 'danger' : d <= 15 ? 'warning' : 'neutral';
};

/** Fase da entrega no trilho; a da área requisitante não tem etapa e só aparece em Todas. */
const faseDa = (e: EntregaFiscalizacao): FaseEntrega | null => (e.responsavel === 'AREA' ? null : etapaDef(e.etapa).fase);

/**
 * Fiscalização › Entregas (migration 260): cada linha é um item de um contrato para um beneficiário. O gestor de
 * fiscalização abre filtrado pelos contratos em que é o fiscal; a linha abre o Contrato 360 na aba Fiscalização.
 */
export const FiscalizacaoEntregasPage: React.FC = () => {
  const { user, role } = useAuth();
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useEntregasFiscalizacao(null);
  const { servidores } = useFiscaisAtivos();
  const [params, setParams] = useSearchParams();
  const ehFiscal = role === 'gestor_fiscalizacao';
  const seg: Segmento = (SEGMENTOS as string[]).includes(params.get('ver') ?? '') ? (params.get('ver') as Segmento) : ehFiscal ? 'VOCE' : 'TODAS';
  const [busca, setBusca] = useState(params.get('busca') ?? '');
  const [aberto, setAberto] = useState<EntregaFiscalizacao | null>(null);
  const [fiscal, setFiscal] = useState(() => (role === 'gestor_fiscalizacao' && user?.id ? user.id : ''));
  const [prazo, setPrazo] = useState<string>(params.get('prazo') ?? '');
  const [quem, setQuem] = useState('');
  const [uf, setUf] = useState('');
  const [fase, setFase] = useState(params.get('fase') ?? '');
  const [programa, setPrograma] = useState('');
  const [itemAta, setItemAta] = useState(params.get('itemAta') ?? '');
  const entregas = useMemo(() => data ?? [], [data]);

  const doFiscal = useMemo(() => entregas.filter((e) => !fiscal || e.fiscalUserId === fiscal), [entregas, fiscal]);
  const fiscais = useMemo(() => fiscaisVisiveis(servidores, new Set(entregas.map((e) => e.fiscalUserId).filter((id): id is string => Boolean(id)))), [servidores, entregas]);
  const opcoesFiscal = fiscais.map((f) => ({ value: f.id, label: f.id === user?.id ? `${f.nome} (você)` : f.nome, count: entregas.filter((e) => e.fiscalUserId === f.id).length }));
  const conta = (s: Segmento) => doFiscal.filter((e) => s === 'TODAS' || LADO[comQuemEstaOItem(e)] === s).length;
  const doSeg = useMemo(() => doFiscal.filter((e) => seg === 'TODAS' || LADO[comQuemEstaOItem(e)] === seg), [doFiscal, seg]);
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return doSeg
      .filter((e) => {
        if (q && !`${e.contratoNumero} ${e.fornecedor ?? ''} ${nomeDoItem(e)} ${rotuloDoBeneficiario(e).principal} ${e.beneficiarioNome ?? ''} ${e.emenda ?? ''} ${e.municipio ?? ''}`.toLowerCase().includes(q)) return false;
        if (prazo && faixaDoPrazo(e) !== prazo) return false;
        if (quem && e.responsavel !== quem) return false;
        if (uf && e.uf !== uf) return false;
        if (fase && faseDa(e) !== fase) return false;
        if (programa && e.programaTexto !== programa) return false;
        if (itemAta && (itemAta === 'SEM') !== !e.itemKey) return false;
        return true;
      })
      .sort((a, b) => {
        const pa = prazoDaEntrega(a).dias ?? 99999;
        const pb = prazoDaEntrega(b).dias ?? 99999;
        return pa - pb || a.contratoNumero.localeCompare(b.contratoNumero);
      });
  }, [doSeg, busca, prazo, quem, uf, fase, programa, itemAta]);
  const ativos = Boolean(busca || prazo || quem || uf || fase || programa || itemAta || (fiscal && !ehFiscal));
  const chave = useCallback((e: EntregaFiscalizacao) => e.id, []);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(filtradas, chave, POR_PAGINA);
  const ufs = useMemo(() => [...new Set(doSeg.map((e) => e.uf).filter((x): x is string => Boolean(x)))].sort(), [doSeg]);
  const contaPrazo = (t: string) => doSeg.filter((e) => faixaDoPrazo(e) === t).length;
  const progs = useMemo(() => [...new Set(doSeg.map((e) => e.programaTexto).filter((x): x is string => Boolean(x)))].sort(), [doSeg]);

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Itens"
        subtitle="Cada linha é um item de um contrato para um beneficiário."
        hint={`Com você: o próximo passo do item é do fiscal (emitir a Ordem, cobrar o fornecedor, receber, enviar para pagamento). Com outros: está com a CAEP, o Exército, o fornecedor, o financeiro ou a área requisitante. Os itens de emenda vêm das linhas do pedido quando o contrato fica com a ${NOME_SFC}; o prazo conta pela data prevista de entrega. A linha abre a janela do item.`}
        icon={<PackageCheck size={26} color="var(--primary)" aria-hidden="true" />}
        actions={<HeaderRefreshAction onRefresh={() => refetch()} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="fisc-entregas-atualizar" tooltipTitle="Recarregar os itens" />}
      />
      <CarteiraSegmentTabs<Segmento>
        testIdPrefix="fisc-entregas-seg"
        ariaLabel="Com quem está o item"
        active={seg}
        onSelect={(s) => setParams((atual) => { const p = new URLSearchParams(atual); p.set('ver', s); return p; }, { replace: true })}
        segments={[
          { id: 'VOCE', label: ehFiscal ? 'Com você' : 'Com o fiscal', count: conta('VOCE'), dot: 'var(--primary)' },
          { id: 'OUTROS', label: 'Com outros', count: conta('OUTROS'), dot: 'var(--color-warning)' },
          { id: 'TODAS', label: 'Todos', count: conta('TODAS') },
          { id: 'FINALIZADO', label: 'Finalizados', count: conta('FINALIZADO') }
        ]}
      />
      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar por contrato, item, beneficiário, cidade ou emenda..."
        onChangeBusca={setBusca}
        hasActiveFilters={ativos}
        onResetFilters={() => { setBusca(''); setPrazo(''); setQuem(''); setUf(''); setFase(''); setPrograma(''); setItemAta(''); setFiscal(ehFiscal && user?.id ? user.id : ''); }}
        counter={carteiraCounter(filtradas.length, doSeg.length, ativos, 'item', 'itens')}
        testIdPrefix="fisc-entregas"
      >
        <CarteiraFilterButton label="Fiscal" value={fiscal} emptyValue="" options={opcoesFiscal} onChange={setFiscal} testId="fisc-entregas-filtro-fiscal" />
        <CarteiraFilterButton label="Prazo" value={prazo} emptyValue="" options={[{ value: 'danger', label: 'Vencido', count: contaPrazo('danger') }, { value: 'warning', label: 'Vence em 15 dias', count: contaPrazo('warning') }, { value: 'neutral', label: 'Em dia ou sem prazo', count: contaPrazo('neutral') }, { value: 'entregue', label: 'Entregue', count: contaPrazo('entregue') }]} onChange={setPrazo} testId="fisc-entregas-filtro-prazo" />
        <CarteiraFilterButton label="Fase" value={fase} emptyValue="" options={FASES_ENTREGA.map((f) => ({ value: f.id, label: f.nome, count: doSeg.filter((e) => faseDa(e) === f.id).length }))} onChange={setFase} testId="fisc-entregas-filtro-fase" />
        <CarteiraFilterButton label="Programa" value={programa} emptyValue="" options={progs.map((p) => ({ value: p, label: p, count: doSeg.filter((e) => e.programaTexto === p).length }))} onChange={setPrograma} testId="fisc-entregas-filtro-programa" />
        <CarteiraFilterButton label="Item da ata" value={itemAta} emptyValue="" options={[{ value: 'SEM', label: 'Sem item da ata', count: doSeg.filter((e) => !e.itemKey).length }, { value: 'COM', label: 'Com item da ata', count: doSeg.filter((e) => Boolean(e.itemKey)).length }]} onChange={setItemAta} testId="fisc-entregas-filtro-item-ata" />
        <CarteiraFilterButton label="UF" value={uf} emptyValue="" options={ufs.map((u) => ({ value: u, label: u, count: doSeg.filter((e) => e.uf === u).length }))} onChange={setUf} testId="fisc-entregas-filtro-uf" />
        <CarteiraFilterButton label="Quem fiscaliza" value={quem} emptyValue="" options={[{ value: 'SFC', label: NOME_SFC, count: doSeg.filter((e) => e.responsavel === 'SFC').length }, { value: 'AREA', label: 'Área requisitante', count: doSeg.filter((e) => e.responsavel === 'AREA').length }]} onChange={setQuem} testId="fisc-entregas-filtro-quem" />
      </CarteiraFilterBar>
      <AdminListShell
        testId="fisc-entregas-lista"
        isLoading={isLoading}
        isError={isError}
        errorTitle="Não foi possível carregar os itens"
        errorMessage={error?.message || 'Falha ao consultar os itens.'}
        onRetry={() => refetch()}
        isEmpty={!isLoading && filtradas.length === 0}
        emptyTitle={entregas.length === 0 ? 'Nenhum item ainda.' : seg === 'VOCE' ? 'Nada com você agora.' : 'Nenhum item nesta situação.'}
        emptyDescription={entregas.length === 0 ? `Os itens aparecem quando o coordenador põe um contrato de emenda com a ${NOME_SFC} (Início › Fiscalização › Distribuição).` : 'Ajuste a busca ou os filtros.'}
      >
        <EntregasTabela entregas={pageItems} testId="fisc-entregas-tabela" comContrato abrir={setAberto} />
        {aberto && <JanelaDoItem e={aberto} onClose={() => setAberto(null)} />}
        <CarteiraPagination page={currentPage} pageSize={POR_PAGINA} total={filtradas.length} onChange={setPage} testIdPrefix="fisc-entregas" />
      </AdminListShell>
    </PageContainer>
  );
};
